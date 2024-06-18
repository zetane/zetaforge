import { darkModeAtom } from "@/atoms/themeAtom";
import { EditorView } from "@codemirror/view";
import { loadLanguage } from "@uiw/codemirror-extensions-langs";
import { githubLight } from '@uiw/codemirror-theme-github';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

import CodeMirror from "@uiw/react-codemirror";
import { atom, useAtom } from "jotai";

const backgroundTheme = EditorView.theme({
  ".cm-content": {
    backgroundColor: "var(--beCodeEditorBackground)",
    "& ::selection": {
      backgroundColor: "#ffcc00",
    }
  }
});

const viewerBackgroundTheme = EditorView.theme({
  ".cm-content": {
    backgroundColor: "var(--beCodeViewerBackground)",
    "& ::selection": {
      backgroundColor: "#ffcc00",
    }
  }
});

const themeAtom = atom((get) => get(darkModeAtom) ? vscodeDark : githubLight);

export const ViewerCodeMirror = ({ code }) => {
  const [theme] = useAtom(themeAtom);
  return (
    <CodeMirror
      value={code}
      theme={theme}
      extensions={[loadLanguage("python"), viewerBackgroundTheme]}
      readOnly={true}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: false,
        highlightSpecialChar: false,
        history: false,
        foldGutter: false,
        drawSelection: false,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: false,
        syntaxHighlighting: false,
        bracketMatching: false,
        closeBrackets: false,
        autocompletion: false,
        rectangularSelection: false,
        crosshairCursor: false,
        highlightActiveLine: false,
        highlightSelectionMatches: false,
        closeBracketsKeymap: false,
        defaultKeymap: false,
        searchKeymap: true,
        historyKeymap: false,
        foldKeymap: false,
        completionKeymap: false,
        lintKeymap: false,
        tabSize: 2,
      }}
    />
  );
};

export const EditorCodeMirror = ({ code, onChange }) => {
  const [theme] = useAtom(themeAtom);
  return (
    <CodeMirror
      value={code}
      extensions={[loadLanguage("python"), backgroundTheme]}
      basicSetup={{
        tabSize: 2,
        highlightActiveLine: false,
        highlightSelectionMatches: true,
        drawSelection: false,
      }}
      theme={theme}
      onChange={onChange}
    />
  );
};

export const LogsCodeMirror = ({ code, onUpdate }) => {
  const [theme] = useAtom(themeAtom);
  return (
    <CodeMirror
      value={code}
      theme={theme}
      extensions={[EditorView.lineWrapping]}
      readOnly={true}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: false,
        highlightSpecialChar: false,
        history: false,
        foldGutter: false,
        drawSelection: false,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: false,
        syntaxHighlighting: false,
        bracketMatching: false,
        closeBrackets: false,
        autocompletion: false,
        rectangularSelection: false,
        crosshairCursor: false,
        highlightActiveLine: false,
        highlightSelectionMatches: false,
        closeBracketsKeymap: false,
        defaultKeymap: false,
        searchKeymap: true,
        historyKeymap: false,
        foldKeymap: false,
        completionKeymap: false,
        lintKeymap: false,
        tabSize: 2,
      }}
      onUpdate={onUpdate}
    />
  );
};
