This is a fork of [y-webrtc](https://github.com/yjs/y-webrtc) with some modifications. We needed the modifications to create SignedWebrtcProvider (see ../SignedWebrtcProvider.ts for details).

See: https://github.com/yjs/y-webrtc/pull/31 for discussion. Modifications made:

- Migrated to Typescript
- classes moved to separate files
- Most code in y-webrtc was for handling broadcastchannel, signalling and setting up webrtc channels. We've made this explicit by creating a BaseWebrtcProvider.ts provider which handles setting up these connection. Then, the only yjs specific code is implemented in WebrtcProvider.ts. Messages passed over the channels specific to connections / peers are handled in 'Room.ts'. Application / yjs specific messages are then wrapped in a customMessage and handled in WebrtcProvider.ts:onCustomMessage:
- We define a onPeerConnected and onCustomMessage callback that are implemented in WebrtcProvider.ts to send messages in response to initiating a new connection, and in response to custom messages from peers. This means yjs specific logic for broadcast channel vs webrtc peers are now using the same code. The original code had custom behaviour for initiating broadcastchannels (writing messageQueryAwareness, and immediately writing syncstep2). This has now been removed. I don't think this has any impact, but this should be verified
