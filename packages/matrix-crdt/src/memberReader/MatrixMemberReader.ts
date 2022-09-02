import { MatrixClient } from "matrix-js-sdk";
import { lifecycle } from "vscode-lib";
import { MatrixReader } from "../reader/MatrixReader";

type Member = {
  displayname: string;
  user_id: string;
};

/**
 * TODO: possible to replace with matrixClient maySendMessage / maySendEvent?
 *
 * Keeps track of Members in a room with write access
 *
 * Use hasWriteAccess to validate whether a user has write access to the room.
 *
 * A MatrixMemberReader keeps track of users and permissions by
 * retrieving and monitoring m.room.member and m.room.power_levels information
 */
export class MatrixMemberReader extends lifecycle.Disposable {
  private disposed = false;
  private initialized = false;
  private initializing = false;
  private initializeOutdated = false;
  public readonly members: Map<string, Member> = new Map();
  private powerLevels:
    | {
        events: { [event_type: string]: number };
        events_default: number;
        users: { [user_id: string]: number };
        users_default: number;
      }
    | undefined;

  public constructor(
    private matrixClient: MatrixClient,
    private reader: MatrixReader
  ) {
    super();
    this._register(
      this.reader.onEvents((e) => e.events.forEach((e) => this.processEvent(e)))
    );
  }

  public hasWriteAccess(user_id: string, event_type = "m.room.message") {
    if (!this.members.has(user_id)) {
      return false;
    }
    const levels = this.powerLevels!;

    let requiredLevel = levels.events[event_type];
    if (requiredLevel === undefined) {
      requiredLevel = levels.events_default;
    }

    let userLevel = levels.users[user_id];
    if (userLevel === undefined) {
      userLevel = levels.users_default;
    }
    if (typeof userLevel !== "number" || typeof requiredLevel !== "number") {
      throw new Error("unexpected");
    }
    return userLevel >= requiredLevel;
  }

  private processEvent = (event: any) => {
    if (
      event.type !== "m.room.power_levels" &&
      event.type !== "m.room.member"
    ) {
      return;
    }

    if (this.initializing) {
      this.initializeOutdated = true;
      return;
    }

    if (!this.initialized) {
      return;
    }

    if (event.type === "m.room.power_levels") {
      this.powerLevels = event.content;
      // TODO: test
      return;
    }
    if (event.type === "m.room.member") {
      if (
        event.content.membership === "join" ||
        event.content.membership === "invite"
      ) {
        const member: Member = {
          displayname: event.content.displayname,
          user_id: event.state_key,
        };
        this.members.set(event.state_key, member);
      } else {
        this.members.delete(event.state_key);
      }
      return;
    }

    throw new Error("unexpected");
  };

  public async initialize(): Promise<void> {
    if (this.initializing || this.initialized) {
      throw new Error("already initializing / initialized");
    }

    if (!this.reader.isStarted) {
      throw new Error(
        "MatrixReader must have started before initializing MatrixMemberReader"
      );
    }

    this.initializing = true;
    const [powerLevels, members] = await Promise.all([
      this.matrixClient.getStateEvent(
        this.reader.roomId,
        "m.room.power_levels",
        undefined as any
      ),
      this.matrixClient.members(
        this.reader.roomId,
        undefined,
        ["knock", "leave", "ban"] as any // any because of https://github.com/matrix-org/matrix-js-sdk/pull/2319
      ),
    ]);
    if (this.initializeOutdated) {
      // A power_levels or member event has been received in the mean time.
      // Simplest (but inefficient) way to make sure we're consistent in this edge-case
      // is to reinitialize
      this.initializing = false;
      this.initializeOutdated = false;
      return this.initialize();
    }

    this.powerLevels = powerLevels as any;
    members.chunk
      .filter(
        (e: any) =>
          e.type === "m.room.member" &&
          (e.content.membership === "join" || e.content.membership === "invite")
      )
      .forEach((e: any) => {
        this.members.set(e.state_key, {
          displayname: e.content.displayname as string,
          user_id: e.state_key as string,
        });
      });

    this.initializing = false;
    this.initialized = true;
  }

  public dispose() {
    this.disposed = true;
    super.dispose();
  }
}
