import { MatrixClient } from "matrix-js-sdk";
import { event, lifecycle } from "vscode-lib";
import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";
import {
  MatrixCRDTEventTranslator,
  MatrixCRDTEventTranslatorOptions,
} from "./MatrixCRDTEventTranslator";
import { MatrixMemberReader } from "./memberReader/MatrixMemberReader";
import { MatrixReader, MatrixReaderOptions } from "./reader/MatrixReader";
import { SignedWebrtcProvider } from "./SignedWebrtcProvider";
import { signObject, verifyObject } from "./util/authUtil";
import { arrayBuffersAreEqual } from "./util/binary";
import { decodeBase64 } from "./util/olmlib";
import {
  ThrottledMatrixWriter,
  ThrottledMatrixWriterOptions,
} from "./writer/ThrottledMatrixWriter";

const DEFAULT_OPTIONS = {
  enableExperimentalWebrtcSync: false,
  reader: {} as MatrixReaderOptions,
  writer: {} as ThrottledMatrixWriterOptions,
  translator: {} as MatrixCRDTEventTranslatorOptions,
};

/**
 * {
 *  // Options for `ThrottledMatrixWriter`
 *  writer: {
 *    // throttle flushing write events to matrix by 500ms
 *    flushInterval: number = 500,
 *    // if writing to the room fails, wait 30 seconds before retrying
 *    retryIfForbiddenInterval: number = 30000
 *  },
 *  // Options for `MatrixCRDTEventTranslator`
 *  translator: {
 *    // set to true to send everything encapsulated in a m.room.message,
 *    // so you can view and debug messages easily in element or other matrix clients
 *    updatesAsRegularMessages: false,
 *    // The event type to use for updates
 *    updateEventType: "matrix-crdt.doc_update",
 *    // The event type to use for snapshots
 *    snapshotEventType: "matrix-crdt.doc_snapshot",
 *  }
 *  // Experimental; we can use WebRTC to sync updates instantly over WebRTC.
 *  // See SignedWebrtcProvider.ts for more details + motivation
 *  enableExperimentalWebrtcSync: boolean = false
 *  // Options for MatrixReader
 *  reader: {
 *    // How often to send a summary snapshot (defaults to once every 30 events)
 *    snapshotInterval: number = 30,
 *  },
 * }
 */
export type MatrixProviderOptions = Partial<typeof DEFAULT_OPTIONS>;

/**
 * Syncs a Matrix room with a Yjs document.
 */
export class MatrixProvider extends lifecycle.Disposable {
  private disposed = false;
  private _roomId: string | undefined;
  private initializeTimeoutHandler: any;

  private initializedResolve: any;

  // TODO: rewrite to remove initializedPromise and use async / await instead
  private readonly initializedPromise = new Promise<void>((resolve) => {
    this.initializedResolve = resolve;
  });

  private webrtcProvider: SignedWebrtcProvider | undefined;
  private reader: MatrixReader | undefined;
  private readonly throttledWriter: ThrottledMatrixWriter;
  private readonly translator: MatrixCRDTEventTranslator;

  private readonly _onDocumentAvailable: event.Emitter<void> = this._register(
    new event.Emitter<void>()
  );

  private readonly _onDocumentUnavailable: event.Emitter<void> = this._register(
    new event.Emitter<void>()
  );

  private readonly _onReceivedEvents: event.Emitter<void> = this._register(
    new event.Emitter<void>()
  );

  private readonly opts: typeof DEFAULT_OPTIONS;

  public readonly onDocumentAvailable: event.Event<void> =
    this._onDocumentAvailable.event;

  public readonly onReceivedEvents: event.Event<void> =
    this._onReceivedEvents.event;

  public readonly onDocumentUnavailable: event.Event<void> =
    this._onDocumentUnavailable.event;

  public get onCanWriteChanged() {
    return this.throttledWriter.onCanWriteChanged;
  }

  public get canWrite() {
    return this.throttledWriter.canWrite;
  }

  public get roomId() {
    return this._roomId;
  }

  public get matrixReader() {
    return this.reader;
  }

  public totalEventsReceived = 0;

  /**
   * Creates an instance of MatrixProvider.
   * @param {Y.Doc} doc The `Y.Doc` to sync over the Matrix Room
   * @param {MatrixClient} matrixClient A `matrix-js-sdk` client with
   * permissions to read (and/or write) from the room
   * @param {({
   *           type: "id";
   *           id: string;
   *         }
   *       | { type: "alias"; alias: string })}
   *          A room alias (e.g.: #room_alias:domain) or
   *          room id (e.g.: !qporfwt:matrix.org)
   *          to sync the document with.
   * @param {awarenessProtocol.Awareness} [awareness]
   * Yjs Awareness instance to sync. Only valid if `opts.enableExperimentalWebrtcSync` is true.
   * @param {MatrixProviderOptions} [opts={}] Additional configuration, all optional. See {@link MatrixProviderOptions}
   * @memberof MatrixProvider
   */
  public constructor(
    private doc: Y.Doc,
    private matrixClient: MatrixClient,

    private room:
      | {
          type: "id";
          id: string;
        }
      | { type: "alias"; alias: string },
    private readonly awareness?: awarenessProtocol.Awareness,
    opts: MatrixProviderOptions = {}
  ) {
    super();
    if (awareness && !opts.enableExperimentalWebrtcSync) {
      throw new Error(
        "awareness is only supported when using enableExperimentalWebrtcSync=true"
      );
    }
    this.opts = { ...DEFAULT_OPTIONS, ...opts };

    this.translator = new MatrixCRDTEventTranslator(this.opts.translator);

    this.throttledWriter = new ThrottledMatrixWriter(
      this.matrixClient,
      this.translator,
      this.opts.writer
    );

    doc.on("update", this.documentUpdateListener);
  }

  /**
   * Listener for changes to the Yjs document.
   * Forwards changes to the Matrix Room if applicable
   */
  private documentUpdateListener = async (update: Uint8Array, origin: any) => {
    if (
      origin === this ||
      (this.webrtcProvider && origin === this.webrtcProvider)
    ) {
      // these are updates that came in from MatrixProvider
      return;
    }
    if (origin?.provider) {
      // update from peer (e.g.: webrtc / websockets). Peer is responsible for sending to Matrix
      return;
    }
    this.throttledWriter.writeUpdate(update);
  };

  /**
   * Handles incoming events from MatrixReader
   */
  private processIncomingEvents = (
    events: any[],
    shouldSendSnapshot = false
  ) => {
    // Filter only relevant events
    events = events.filter((e) => {
      if (
        !this.translator.isUpdateEvent(e) &&
        !this.translator.isSnapshotEvent(e)
      ) {
        return false; // only use messages / snapshots
      }
      return true;
    });

    this.totalEventsReceived += events.length;

    // Create a yjs update from the events
    const updates = events.map(
      (e) => new Uint8Array(decodeBase64(e.content.update))
    );

    const update = Y.mergeUpdates(updates);

    if (!updates.length) {
      // We still return an empty "update" here, because this is
      // used to compare the initial document state in initialization.
      // (maybe we can rewrite to a clearer code-path)
      return update;
    }

    // Apply latest state from server
    Y.applyUpdate(this.doc, update, this);

    // Create and send a snapsnot if necessary
    if (shouldSendSnapshot) {
      const lastEvent = events[events.length - 1];
      const update = Y.encodeStateAsUpdate(this.doc);

      // Note: a snapshot is a representation of the document
      // which is guarantueed to contain all events in the room
      // up to and including last_event_id.
      // A snapshot _could_ also contain events after last_event_id,
      // for example if the local document contains changes that haven't been flushed to Matrix yet.

      this.translator
        .sendSnapshot(
          this.matrixClient,
          this._roomId!,
          update,
          lastEvent.event_id
        )
        .catch((e) => {
          console.error("failed to send snapshot");
        });
    }

    // fire _onReceivedEvents if applicable
    const remoteMessages = events.filter(
      (e) => e.user_id !== this.matrixClient.credentials.userId
    );
    if (remoteMessages.length) {
      this._onReceivedEvents.fire();
    }
    return update;
  };

  /**
   * Experimental; we can use WebRTC to sync updates instantly over WebRTC.
   *
   * The default Matrix-writer only flushes events every 500ms.
   * WebRTC can also sync awareness updates which is not available via Matrix yet.
   * See SignedWebrtcProvider.ts for more details + motivation
   *
   * TODO: we should probably extract this from MatrixProvider so that
   * API consumers can instantiate / configure this seperately
   */
  private async initializeWebrtc() {
    if (!this._roomId) {
      throw new Error("not initialized");
    }
    /*
    TODO:
    - implement password
    - allow options to be passed to WebRtcprovider (e.g.: signalling servers which now default to those supplied by yjs)
    */
    if (!this.reader) {
      throw new Error("needs reader to initialize webrtc");
    }
    const memberReader = this._register(
      new MatrixMemberReader(this.matrixClient, this.reader)
    );
    await memberReader.initialize();

    // See comments in SignedWebrtcProvider.
    //
    // Security:
    // - We should validate whether the use of Matrix keys and signatures here is considered secure
    this.webrtcProvider = new SignedWebrtcProvider(
      this.doc,
      this._roomId,
      this._roomId,
      async (obj) => {
        await signObject(this.matrixClient, obj);
      },
      async (obj) => {
        await verifyObject(
          this.matrixClient,
          memberReader,
          obj,
          this.translator.WrappedEventType
        );
      },
      undefined,
      this.awareness
    );
  }

  private async initializeNoCatch() {
    const roomLogName: string =
      this.room.type === "id" ? this.room.id : this.room.alias;
    try {
      if (this.room.type === "id") {
        this._roomId = this.room.id;
      } else if (this.room.type === "alias") {
        const ret = await this.matrixClient.getRoomIdForAlias(this.room.alias);
        this._roomId = ret.room_id;
      }

      if (!this._roomId) {
        throw new Error("error receiving room id");
      }
      console.log("room resolved", this._roomId);
      await this.throttledWriter.initialize(this._roomId);
    } catch (e: any) {
      let timeout = 5 * 1000;
      if (e.errcode === "M_NOT_FOUND") {
        console.log("room not found", roomLogName);
        this._onDocumentUnavailable.fire();
      } else if (e.name === "ConnectionError") {
        console.log("room not found (offline)", roomLogName);
      } else {
        console.error("error retrieving room", roomLogName, e);
        timeout = 30 * 1000;
        this._onDocumentUnavailable.fire();
      }

      // TODO: current implementation uses polling to get room availability, but should be possible to get a real-time solution
      this.initializeTimeoutHandler = setTimeout(() => {
        this.initialize();
      }, timeout);
      return;
    }

    // We have resolved the roomAlias (if necessary)
    // Now fetch all relevant events for the room to initialize the YDoc

    let initialLocalState = Y.encodeStateAsUpdate(this.doc);
    const initialLocalStateVector =
      Y.encodeStateVectorFromUpdate(initialLocalState);
    const deleteSetOnlyUpdate = Y.diffUpdate(
      initialLocalState,
      initialLocalStateVector
    );

    let oldSnapshot = Y.snapshot(this.doc);
    // This can fail because of no access to room. Because the room history should always be available,
    // we don't catch this event here
    const update = await this.initializeReader();

    this._onDocumentAvailable.fire();

    // Next, find if there are local changes that haven't been synced to the server
    const remoteStateVector = Y.encodeStateVectorFromUpdate(update);

    const missingOnServer = Y.diffUpdate(initialLocalState, remoteStateVector);

    // missingOnServer will always contain the entire deleteSet on startup.
    // Unfortunately diffUpdate doesn't work well with deletes. In the if-statement
    // below, we try to detect when missingOnServer only contains the deleteSet, with
    // deletes that already exist on the server

    if (
      arrayBuffersAreEqual(deleteSetOnlyUpdate.buffer, missingOnServer.buffer)
    ) {
      // TODO: instead of next 3 lines, we can probably get deleteSet directly from "update"
      let serverDoc = new Y.Doc();
      Y.applyUpdate(serverDoc, update);
      let serverSnapshot = Y.snapshot(serverDoc);
      // TODO: could also compare whether snapshot equal? instead of snapshotContainsAllDeletes?
      if (snapshotContainsAllDeletes(serverSnapshot, oldSnapshot)) {
        // missingOnServer only contains a deleteSet with items that are already in the deleteSet on server
        this.initializedResolve();
        return;
      }
    }

    if (missingOnServer.length > 2) {
      this.throttledWriter.writeUpdate(missingOnServer);
    }

    this.initializedResolve();
  }

  /**
   * Get all initial events from the room + start polling
   */
  private async initializeReader() {
    if (this.reader) {
      throw new Error("already initialized reader");
    }
    if (!this._roomId) {
      throw new Error("no roomId");
    }

    this.reader = this._register(
      new MatrixReader(
        this.matrixClient,
        this._roomId,
        this.translator,
        this.opts.reader
      )
    );

    this._register(
      this.reader.onEvents((e) =>
        this.processIncomingEvents(e.events, e.shouldSendSnapshot)
      )
    );
    const events = await this.reader.getInitialDocumentUpdateEvents();
    this.reader.startPolling();
    return this.processIncomingEvents(events);
  }

  /**
   * For testing purposes; make sure pending events have been flushed to Matrix
   */
  public async waitForFlush() {
    await this.initializedPromise;
    await this.throttledWriter.waitForFlush();
  }

  public async initialize() {
    try {
      await this.initializeNoCatch();
      await this.initializedPromise;
      if (!this.disposed && this.opts.enableExperimentalWebrtcSync) {
        await this.initializeWebrtc();
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  public dispose() {
    super.dispose();
    this.disposed = true;
    this.webrtcProvider?.destroy();
    this.reader?.dispose();
    clearTimeout(this.initializeTimeoutHandler);
    this.doc.off("update", this.documentUpdateListener);
  }
}

// adapted from yjs snapshot equals function
function snapshotContainsAllDeletes(
  newSnapshot: Y.Snapshot,
  oldSnapshot: Y.Snapshot
) {
  // only contains deleteSet
  for (const [client, dsitems1] of oldSnapshot.ds.clients.entries()) {
    const dsitems2 = newSnapshot.ds.clients.get(client) || [];
    if (dsitems1.length > dsitems2.length) {
      return false;
    }
    for (let i = 0; i < dsitems1.length; i++) {
      const dsitem1 = dsitems1[i];
      const dsitem2 = dsitems2[i];
      if (dsitem1.clock !== dsitem2.clock || dsitem1.len !== dsitem2.len) {
        return false;
      }
    }
  }
  return true;
}
