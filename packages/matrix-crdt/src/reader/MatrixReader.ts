import {
  Direction,
  MatrixClient,
  MatrixEvent,
  Method,
  Room,
  RoomEvent,
} from "matrix-js-sdk";
import { event, lifecycle } from "vscode-lib";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";

const PEEK_POLL_TIMEOUT = 30 * 1000;
const PEEK_POLL_ERROR_TIMEOUT = 30 * 1000;

const DEFAULT_OPTIONS = {
  snapshotInterval: 30, // send a snapshot after 30 events
};

export type MatrixReaderOptions = Partial<typeof DEFAULT_OPTIONS>;

/**
 * A helper class to read messages from Matrix using a MatrixClient,
 * without relying on the sync protocol.
 */
export class MatrixReader extends lifecycle.Disposable {
  public latestToken: string | undefined;
  private disposed = false;
  private polling = false;
  private pendingPollRequest: any;
  private pollRetryTimeout: ReturnType<typeof setTimeout> | undefined;
  private messagesSinceSnapshot = 0;

  private readonly _onEvents = this._register(
    new event.Emitter<{ events: any[]; shouldSendSnapshot: boolean }>()
  );
  public readonly onEvents: event.Event<{
    events: any[];
    shouldSendSnapshot: boolean;
  }> = this._onEvents.event;

  private readonly opts: typeof DEFAULT_OPTIONS;

  public constructor(
    private matrixClient: MatrixClient,
    public readonly roomId: string,
    private readonly translator: MatrixCRDTEventTranslator,
    opts: MatrixReaderOptions = {}
  ) {
    super();
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    // TODO: catch events for when room has been deleted or user has been kicked
    this.matrixClient.on(RoomEvent.Timeline, this.matrixRoomListener);
  }

  /**
   * Only receives messages from rooms the user has joined, and after startClient() has been called
   * (i.e.: they're received via the sync API).
   */
  private matrixRoomListener = (
    event: MatrixEvent,
    room: Room,
    _toStartOfTimeline: boolean
  ) => {
    // TODO: for e2ee support we now call `startClient`.
    // For rooms we've joined, the client will now get messages here, but also by polling /events.
    // We should probably remove the polling if it's not necessary anymore, and handle messages in this function, like below:
    //
    // if (room.roomId !== this.roomId) {
    //   return;
    // }
    // console.error("not expected; Room.timeline on MatrixClient");
    // const events = [event.event];
    // const shouldSendSnapshot = this.processIncomingEventsForSnapshot(events);
    // if (events.length) {
    //   this._onEvents.fire({ events: events, shouldSendSnapshot });
    // }
  };

  /**
   * Handle incoming events to determine whether a snapshot message needs to be sent
   *
   * MatrixReader keeps an internal counter of messages received.
   * every opts.snapshotInterval messages, we send a snapshot of the entire document state.
   */
  private processIncomingEventsForSnapshot(events: any[]) {
    let shouldSendSnapshot = false;
    for (let event of events) {
      if (this.translator.isUpdateEvent(event)) {
        if (event.room_id !== this.roomId) {
          throw new Error("event received with invalid roomid");
        }
        this.messagesSinceSnapshot++;
        if (
          this.messagesSinceSnapshot % this.opts.snapshotInterval === 0 &&
          event.user_id === this.matrixClient.credentials.userId
        ) {
          // We don't want multiple users send a snapshot at the same time,
          // to prevent this, we have a simple (probably not fool-proof) "snapshot user election"
          // system which says that the user who sent a message SNAPSHOT_INTERVAL events since
          // the last snapshot is responsible for posting a new snapshot.

          // In case a user fails to do so,
          // we use % to make sure we retry this on the next SNAPSHOT_INTERVAL
          shouldSendSnapshot = true;
        }
      } else if (this.translator.isSnapshotEvent(event)) {
        this.messagesSinceSnapshot = 0;
        shouldSendSnapshot = false;
      }
    }
    return shouldSendSnapshot;
  }

  private async decryptRawEventsIfNecessary(rawEvents: any[]) {
    const events = await Promise.all(
      rawEvents.map(async (event: any) => {
        if (event.type === "m.room.encrypted") {
          const decrypted = (
            await this.matrixClient.crypto.decryptEvent(new MatrixEvent(event))
          ).clearEvent;
          return decrypted;
        } else {
          return event;
        }
      })
    );
    return events;
  }

  /**
   * Peek for new room events using the Matrix /events API (long-polling)
   * This function automatically keeps polling until MatrixReader.dispose() is called
   */
  private async peekPoll() {
    if (!this.latestToken) {
      throw new Error("polling but no pagination token");
    }
    if (this.disposed) {
      return;
    }
    try {
      this.pendingPollRequest = this.matrixClient.http.authedRequest(
        undefined as any,
        Method.Get,
        "/events",
        {
          room_id: this.roomId,
          timeout: PEEK_POLL_TIMEOUT + "",
          from: this.latestToken,
        },
        undefined,
        { localTimeoutMs: PEEK_POLL_TIMEOUT * 2 }
      );
      const results = await this.pendingPollRequest;
      this.pendingPollRequest = undefined;
      if (this.disposed) {
        return;
      }

      const events = await this.decryptRawEventsIfNecessary(results.chunk);

      const shouldSendSnapshot = this.processIncomingEventsForSnapshot(events);

      if (events.length) {
        this._onEvents.fire({ events: events, shouldSendSnapshot });
      }

      this.latestToken = results.end;
      this.peekPoll();
    } catch (e) {
      console.error("peek error", e);
      if (!this.disposed) {
        this.pollRetryTimeout = setTimeout(
          () => this.peekPoll(),
          PEEK_POLL_ERROR_TIMEOUT
        );
      }
    }
  }

  /**
   * Before starting polling, call getInitialDocumentUpdateEvents to get the history of events
   * when coming online.
   *
   * This methods paginates back until
   * - (a) all events in the room have been received. In that case we return all events.
   * - (b) it encounters a snapshot. In this case we return the snapshot event and all update events
   *        that occur after that latest snapshot
   *
   * (if typeFilter is set we retrieve all events of that type. TODO: can we deprecate this param?)
   */
  public async getInitialDocumentUpdateEvents(typeFilter?: string) {
    let ret: any[] = [];
    let token = "";
    let hasNextPage = true;
    let lastEventInSnapshot: string | undefined;
    while (hasNextPage) {
      const res = await this.matrixClient.createMessagesRequest(
        this.roomId,
        token,
        30,
        Direction.Backward
        // TODO: filter?
      );

      const events = await this.decryptRawEventsIfNecessary(res.chunk);

      for (let event of events) {
        if (typeFilter) {
          if (event.type === typeFilter) {
            ret.push(event);
          }
        } else if (this.translator.isSnapshotEvent(event)) {
          ret.push(event);
          lastEventInSnapshot = event.content.last_event_id;
        } else if (this.translator.isUpdateEvent(event)) {
          if (lastEventInSnapshot && lastEventInSnapshot === event.event_id) {
            if (!this.latestToken) {
              this.latestToken = res.start;
            }
            return ret.reverse();
          }
          this.messagesSinceSnapshot++;
          ret.push(event);
        }
      }

      token = res.end;
      if (!this.latestToken) {
        this.latestToken = res.start;
      }
      hasNextPage = !!(res.start !== res.end && res.end);
    }
    return ret.reverse();
  }

  /**
   * Start polling the room for messages
   */
  public startPolling() {
    if (this.polling) {
      throw new Error("already polling");
    }
    this.polling = true;
    this.peekPoll();
  }

  public get isStarted() {
    return this.polling;
  }

  public dispose() {
    this.disposed = true;
    super.dispose();
    if (this.pollRetryTimeout) {
      clearTimeout(this.pollRetryTimeout);
    }
    if (this.pendingPollRequest) {
      this.pendingPollRequest.abort();
    }
    this.matrixClient.off(RoomEvent.Timeline, this.matrixRoomListener);
  }
}
