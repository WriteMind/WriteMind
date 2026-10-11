# Zen

A quiet, mobile-friendly space to write Markdown and sketch. No build step, accounts or analytics. Formatting uses marked, DOMPurify, Turndown and KaTeX from public CDNs.

- Write plain Markdown and download it with **Save .md**.
- Use **Load .md** to open Markdown or text files.
- Pick a sound from the list in the header (flute, hang drum, piano, violin, lofi or brown noise) and press play. The instrument loops were made with Google Gemini; each starts from the beginning and repeats seamlessly.
- Drafts recover automatically in the same browser, when local storage is available. Download a Markdown file for a lasting backup.
- Use the full screen button to write without distractions (on iPad, Safari may leave full screen when the keyboard opens — the focus view with hidden menus stays on until you press the button again; for full screen that never drops out, use Share → Add to Home Screen). The eye button beside the menu hides or shows the menus (Esc brings them back).
- You write in formatted text by default (type `# ` for a heading, `- ` for a list, `**bold**`, Ctrl+B / Ctrl+I). **Code** shows the Markdown underneath. Equations: `$x^2$` inline, `$$ … $$` on their own lines. Undo / redo buttons sit beside the tools.
- **Focus** keeps the line you're writing bright and gently dims the text above and below.
- **Export** your writing as Markdown, a web page, PDF (print) or plain text.
- **Picture** (or paste / drop an image) adds pictures. They are kept in this browser and embedded into the .md file when you save.
- **Board** opens an endless whiteboard: select (drag on empty space to select an area, Shift to add; move, recolor, delete, Ctrl+C / Ctrl+V / Ctrl+D), Markdown text boxes with equations (double-click to edit), text inside rectangles, circles and triangles (tap a shape with the text tool or double-tap it), sticky notes (N; the selected color sets the note color), connectors (C; drag from one shape, note, text or picture to another — straight, curved or elbow, and they follow when things move), pen, eraser, rectangle, circle, triangle, line and arrow (Shift keeps squares and circles even), pictures (button, paste or drop; select to move, drag the corner to resize), pan (hand tool, Space or two fingers), zoom (Ctrl + scroll or pinch). With an Apple Pencil or other stylus, only the pen draws (with pressure: press harder for a thicker line; toggle it with the pressure button): your palm and single fingers are ignored, and two fingers pan and zoom, undo and redo. Export as PNG, JPG, SVG, PDF or a .json board file, and reopen a board file with the Open button The eye button at the bottom hides the board menus. The board is kept in this browser.
- Pick a theme in the header: Auto (follows your device), Light, Dark or Sepia.
- **Backups** keeps your drafts from the last two sessions so you can restore an earlier one.

## GitHub Pages

Push these files to a GitHub repository. In **Settings → Pages**, choose **Deploy from a branch**, select your branch and **/(root)**, and save. GitHub displays the published address on that page after deployment.

## Local preview

Run `node server.cjs` and open http://localhost:4173.

## Troubleshooting

Add `?debug` to the address (for example `https://writemind.github.io/WriteMind/?debug`) to show a small panel with live typing timings and Apple Pencil event counts. Tap the panel to reset the counters.
