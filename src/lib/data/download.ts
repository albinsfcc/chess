export function downloadText(text: string, filename: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
  try { anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
