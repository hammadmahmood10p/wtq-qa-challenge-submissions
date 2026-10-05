/**
 * Blocking the clipboard on the fields a participant is being assessed on.
 *
 * The organisers' reason is the obvious one: a bug report pasted in from elsewhere is
 * not the participant's manual testing, and Challenge 1 exists to measure exactly that.
 * Challenges 2 to 4 ask for written answers about their own approach, which has the
 * same problem.
 *
 * Two things worth being honest about.
 *
 * **This is a speed bump, not a control.** Anyone determined can type into the
 * developer console, or retype from another window. It raises the cost of the casual
 * paste, which is what it is for; it is not a guarantee and should not be described as
 * one to the organisers.
 *
 * **It is user-hostile by design, so it is scoped tightly.** Only the assessed text
 * fields carry it. File uploads, drag-and-drop of evidence, the GitHub URL field and
 * everything in the admin console are untouched — a participant who cannot paste a
 * repository link they just copied from GitHub would be being punished for nothing.
 */

/** What a blocked attempt should say. Short, because it appears as a title attribute. */
export const NO_CLIPBOARD_HINT =
  "Copying and pasting are turned off here — this answer has to be typed.";

type ClipboardHandlers = {
  onPaste: (event: React.ClipboardEvent) => void;
  onCopy: (event: React.ClipboardEvent) => void;
  onCut: (event: React.ClipboardEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  title: string;
};

/**
 * Handlers that refuse clipboard and drag-drop text on an input or textarea.
 *
 * `onDrop` matters as much as `onPaste`: dragging selected text from another window
 * into a field bypasses the clipboard entirely, and blocking paste alone would leave
 * the obvious workaround open.
 *
 * `onNotice` lets the field say why nothing happened. Silence reads as a broken
 * control, and a participant who thinks the form is broken will spend their time on
 * that rather than on testing.
 */
export function noClipboard(onNotice?: () => void): ClipboardHandlers {
  const refuse = (event: React.ClipboardEvent | React.DragEvent) => {
    event.preventDefault();
    onNotice?.();
  };

  return {
    onPaste: refuse,
    onCopy: refuse,
    onCut: refuse,
    onDrop: refuse,
    // Without this the browser shows a "copy" cursor over the field and then silently
    // does nothing, which looks like a bug rather than a rule.
    onDragOver: (event) => event.preventDefault(),
    title: NO_CLIPBOARD_HINT,
  };
}
