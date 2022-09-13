export type PublicRoomPermissionType = "public-read-write" | "public-read";

export type RoomSecuritySetting =
  | {
      permissions: PublicRoomPermissionType;
      encrypted: false; // it doesn't make sense to encrypt public rooms
    }
  | {
      permissions: "private"; // TODO: read-only private rooms (using power levels)
      encrypted: boolean;
    };

/**
 * Helper function to create a Matrix room suitable for use with MatrixProvider.
 */
export async function createMatrixRoom(
  matrixClient: any,
  roomName: string,
  security: RoomSecuritySetting
) {
  try {
    const initial_state = [];

    // guests should not be able to actually join the room,
    // because we don't want guests to be able to write
    initial_state.push({
      type: "m.room.guest_access",
      state_key: "",
      content: {
        guest_access: "forbidden",
      },
    });

    // if there is no public write access, make sure to set
    // join_rule to invite
    initial_state.push({
      type: "m.room.join_rules",
      content: {
        join_rule:
          security.permissions === "public-read-write" ? "public" : "invite",
      },
    });

    // The history of a (publicly accessible) room should be readable by everyone,
    // so that all users can get all yjs updates
    initial_state.push({
      type: "m.room.history_visibility",
      content: {
        history_visibility: "world_readable",
      },
    });

    // for e2ee
    if (security.encrypted) {
      initial_state.push({
        type: "m.room.encryption",
        state_key: "",
        content: {
          algorithm: "m.megolm.v1.aes-sha2",
        },
      });
    }

    const ret = await matrixClient.createRoom({
      room_alias_name: roomName,
      visibility: security.permissions === "private" ? "private" : "public", // Whether this room is visible to the /publicRooms API or not." One of: ["private", "public"]
      name: roomName,
      topic: "",
      initial_state,
    });

    // TODO: add room to space

    return { status: "ok" as "ok", roomId: ret.room_id };
  } catch (e: any) {
    if (e.errcode === "M_ROOM_IN_USE") {
      return "already-exists" as "already-exists";
    }
    if (e.name === "ConnectionError") {
      return "offline";
    }

    return {
      status: "error" as "error",
      error: e,
    };
    // offline error?
  }
}

export async function getMatrixRoomSecurity(
  matrixClient: any,
  roomId: string
): Promise<RoomSecuritySetting | { status: "error"; error: any }> {
  let result: any;

  // TODO: what about private rooms?

  try {
    result = await matrixClient.getStateEvent(roomId, "m.room.join_rules");
  } catch (e) {
    return {
      status: "error" as "error",
      error: e,
    };
  }

  if (result.join_rule === "public") {
    return {
      permissions: "public-read-write",
      encrypted: false,
    };
  } else if (result.join_rule === "invite") {
    return {
      permissions: "public-read",
      encrypted: false,
    };
  } else {
    throw new Error("unsupported join_rule");
  }
}

/**
 * Helper function to change access of a Matrix Room
 * Access can currently be set to "public-read-write" | "public-read"
 */
export async function updateMatrixRoomAccess(
  matrixClient: any,
  roomId: string,
  security: RoomSecuritySetting
) {
  try {
    await matrixClient.sendStateEvent(
      roomId,
      "m.room.join_rules",
      {
        join_rule:
          security.permissions === "public-read-write" ? "public" : "invite",
      },
      ""
    );

    //  TODO: set encryption

    // TODO: add room to space

    return { status: "ok" as "ok", roomId };
  } catch (e: any) {
    if (e.name === "ConnectionError") {
      return "offline";
    }

    return {
      status: "error" as "error",
      error: e,
    };
  }
}
