/* eslint-disable jsx-a11y/role-supports-aria-props */
import { Button } from "@primer/react";

export const MenuBar = ({ editor }: any) => {
  if (!editor) {
    return null;
  }

  return (
    <>
      <div>
        <div className="BtnGroup">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            aria-selected={editor.isActive("bold")}
            className="BtnGroup-item btn">
            bold
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            aria-selected={editor.isActive("italic")}
            className="BtnGroup-item btn">
            italic
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            aria-selected={editor.isActive("strike")}
            className="BtnGroup-item btn">
            strike
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            aria-selected={editor.isActive("code")}
            className="BtnGroup-item btn">
            code
          </button>
        </div>
        <div className="BtnGroup">
          <button
            onClick={() => editor.chain().focus().unsetAllMarks().run()}
            className="BtnGroup-item btn">
            clear marks
          </button>
          <button
            onClick={() => editor.chain().focus().clearNodes().run()}
            className="BtnGroup-item btn">
            clear nodes
          </button>
        </div>
      </div>
      <div>
        <div className="BtnGroup">
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            aria-selected={editor.isActive("heading", { level: 1 })}
            className="BtnGroup-item btn">
            h1
          </button>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            aria-selected={editor.isActive("heading", { level: 2 })}
            className="BtnGroup-item btn">
            h2
          </button>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            aria-selected={editor.isActive("heading", { level: 3 })}
            className="BtnGroup-item btn">
            h3
          </button>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 4 }).run()
            }
            aria-selected={editor.isActive("heading", { level: 4 })}
            className="BtnGroup-item btn">
            h4
          </button>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 5 }).run()
            }
            aria-selected={editor.isActive("heading", { level: 5 })}
            className="BtnGroup-item btn">
            h5
          </button>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 6 }).run()
            }
            aria-selected={editor.isActive("heading", { level: 6 })}
            className="BtnGroup-item btn">
            h6
          </button>
        </div>
      </div>
      <div>
        <div className="BtnGroup">
          <button
            onClick={() => editor.chain().focus().setParagraph().run()}
            aria-selected={editor.isActive("paragraph")}
            className="BtnGroup-item btn">
            paragraph
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            aria-selected={editor.isActive("bulletList")}
            className="BtnGroup-item btn">
            bullet list
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            aria-selected={editor.isActive("orderedList")}
            className="BtnGroup-item btn">
            ordered list
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            aria-selected={editor.isActive("codeBlock")}
            className="BtnGroup-item btn">
            code block
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            aria-selected={editor.isActive("blockquote")}
            className="BtnGroup-item btn">
            blockquote
          </button>
        </div>
      </div>
      <div>
        <div className="BtnGroup">
          <button
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="BtnGroup-item btn">
            horizontal rule
          </button>
          <button
            onClick={() => editor.chain().focus().setHardBreak().run()}
            className="BtnGroup-item btn">
            hard break
          </button>
          <button
            onClick={() => editor.chain().focus().undo().run()}
            className="BtnGroup-item btn">
            undo
          </button>
          <button
            onClick={() => editor.chain().focus().redo().run()}
            className="BtnGroup-item btn">
            redo
          </button>
        </div>
      </div>
    </>
  );
};
