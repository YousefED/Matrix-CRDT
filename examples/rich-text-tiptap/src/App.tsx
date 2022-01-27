import { Box, Heading } from "@primer/react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React from "react";
import * as Y from "yjs";
import * as ap from "y-protocols/awareness";
import MatrixStatusBar from "./MatrixStatusBar";
// import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { MenuBar } from "./MenuBar";
import "./styles.css";

const colors = [
  "#958DF1",
  "#F98181",
  "#FBBC88",
  "#FAF594",
  "#70CFF8",
  "#94FADB",
  "#B9F18D",
];
const names = ["Kevin", "Martin"];

const getRandomElement = (list: any[]) =>
  list[Math.floor(Math.random() * list.length)];
const getRandomColor = () => getRandomElement(colors);
const getRandomName = () => getRandomElement(names);

class fakeprovider {
  constructor(public awareness: any) {}
}
const yDoc = new Y.Doc();
const fragment = yDoc.getXmlFragment("richtext");
const awareness = new ap.Awareness(yDoc);
export default function App() {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write something …",
      }),
      Collaboration.configure({
        fragment,
      }),
      CollaborationCursor.configure({
        provider: new fakeprovider(awareness),
        user: { name: getRandomName(), color: getRandomColor() },
      }),
    ],
  });

  return (
    <Box m={3} maxWidth={600} marginLeft={"auto"} marginRight={"auto"} p={3}>
      {/* This is the top bar with Sign in button and Matrix status
          It also takes care of hooking up the Y.Doc to Matrix.
      */}
      <MatrixStatusBar doc={yDoc} awareness={awareness} />

      <Heading sx={{ mb: 2 }}>Rich text collaboration</Heading>
      <p className="description">
        A collaborative Rich Text editing experience (similar to Google Docs)
        using <a href="https://github.com/YousefED/Matrix-CRDT">Matrix-CRDT</a>.
        Edits can be synced to a Matrix Room. Users can work offline and edits
        are seamlessly synced when they reconnect to the Matrix room.
      </p>
      <MenuBar editor={editor} />
      <div className="editor">
        <EditorContent editor={editor} />
      </div>
    </Box>
  );
}
