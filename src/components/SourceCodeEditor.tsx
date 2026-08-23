import { bracketMatching, HighlightStyle, LanguageDescription, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, highlightActiveLineGutter, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { SourceSnapshot } from "../types";

type SourceCodeEditorProps = {
  snapshot: SourceSnapshot;
};

export type SourceCodeEditorHandle = {
  returnToFocus: () => void;
};

const sourceHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword], color: "#8a3373", fontWeight: "600" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "#6846a5" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#8a5a00" },
  { tag: [tags.propertyName, tags.attributeName], color: "#006d78" },
  { tag: [tags.string, tags.character, tags.attributeValue], color: "#357246" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "#a14920" },
  { tag: [tags.operator, tags.operatorKeyword], color: "#3f5960" },
  { tag: [tags.tagName, tags.regexp], color: "#b3404a" },
  { tag: [tags.comment, tags.docComment], color: "#778078", fontStyle: "italic" },
  { tag: [tags.heading, tags.strong], color: "#2d568c", fontWeight: "700" },
  { tag: [tags.link, tags.url], color: "#2d6f8f", textDecoration: "underline" },
  { tag: [tags.meta, tags.processingInstruction], color: "#7b5f2f" },
  { tag: tags.invalid, color: "#b42318", textDecoration: "underline wavy" },
]);

const sourceEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "#252823",
    backgroundColor: "#fbfbf8",
    fontSize: "var(--source-font-size, 13px)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--mono)",
    lineHeight: "1.62",
    overflow: "auto",
    overscrollBehavior: "none",
    touchAction: "pan-x pan-y",
    scrollbarColor: "#b9b8b0 transparent",
    overflowAnchor: "none",
  },
  ".cm-content": {
    minWidth: "max-content",
    padding: "12px 0 28px",
    caretColor: "transparent",
  },
  ".cm-line": { padding: "0 28px 0 16px" },
  ".cm-gutters": {
    borderRight: "1px solid #e2e1db",
    color: "#8e928b",
    backgroundColor: "#f0f0eb",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "55px",
    padding: "0 11px 0 5px",
  },
  ".cm-activeLine": {
    backgroundColor: "#fff0c9",
    boxShadow: "inset 3px 0 #b66d12, inset 0 1px rgba(182, 109, 18, 0.13), inset 0 -1px rgba(182, 109, 18, 0.13)",
  },
  ".cm-activeLineGutter": {
    color: "#8d5716",
    backgroundColor: "#f7dfaa",
    fontWeight: "700",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(61, 97, 159, 0.14)",
  },
  ".cm-cursor": { display: "none" },
});

export const SourceCodeEditor = forwardRef<SourceCodeEditorHandle, SourceCodeEditorProps>(function SourceCodeEditor({ snapshot }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useImperativeHandle(ref, () => ({
    returnToFocus: () => {
      if (viewRef.current) revealSourceFocus(viewRef.current, snapshot);
    },
  }), [snapshot]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const languageSlot = new Compartment();
    const state = EditorState.create({
      doc: snapshot.content,
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        lineNumbers({ formatNumber: (line) => String(snapshot.start_line + line - 1) }),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        syntaxHighlighting(sourceHighlightStyle),
        sourceEditorTheme,
        languageSlot.of([]),
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    revealSourceFocus(view, snapshot);

    let disposed = false;
    const description = sourceLanguageDescription(snapshot.path);
    if (description) {
      void description.load().then((support) => {
        if (!disposed) view.dispatch({ effects: languageSlot.reconfigure(support) });
      }).catch(() => undefined);
    }

    return () => {
      disposed = true;
      viewRef.current = null;
      view.destroy();
    };
  }, [snapshot]);

  return <div ref={hostRef} className="source-code-editor" data-language={sourceLanguageName(snapshot.path)} />;
});

export function sourceFocusDocumentLine(snapshot: SourceSnapshot): number {
  const lineCount = Math.max(snapshot.content.split("\n").length, 1);
  return Math.min(
    Math.max((snapshot.focus_line || snapshot.start_line) - snapshot.start_line + 1, 1),
    lineCount,
  );
}

function revealSourceFocus(view: EditorView, snapshot: SourceSnapshot) {
  const focusPosition = view.state.doc.line(sourceFocusDocumentLine(snapshot)).from;
  view.dispatch({
    selection: { anchor: focusPosition },
    effects: EditorView.scrollIntoView(focusPosition, { y: "center", x: "start" }),
  });
}

export function sourceLanguageName(path: string): string {
  return sourceLanguageDescription(path)?.name ?? "Plain Text";
}

function sourceLanguageDescription(path: string): LanguageDescription | null {
  return LanguageDescription.matchFilename(languages, path);
}
