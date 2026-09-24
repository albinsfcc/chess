import { expect, test, type Page } from "@playwright/test";
import { Chess, DEFAULT_POSITION } from "chess.js";

const mockWorker = `
let current;
self.onmessage = ({data}) => {
  if(data.type === 'initialize') postMessage({type:'ready',engineVersion:'Stockfish 19 Test'});
  if(data.type !== 'search') return;
  const request=data.request; current=request.requestId;
  const black=request.fen.split(' ')[1]==='b'; const move=black?'e7e5':'e2e4';
  const result={...request,engineBuild:'stockfish-js-19.0.0-lite-single',engineVersion:'Stockfish 19 Test',bestMove:move,bestMoveSan:black?'e5':'e4',
    lines:Array.from({length:request.config.multiPv},(_,i)=>({multiPv:i+1,depth:12,score:{type:'cp',value:35},lowerBound:false,upperBound:false,pvUci:[move],pvSan:[black?'e5':'e4'],replayComplete:true}))};
  setTimeout(()=>postMessage({type:'result',result,complete:false}),70);
  // Deliberately send even cancelled/stale output to exercise client rejection.
  setTimeout(()=>postMessage({type:'result',result,complete:true}),600);
};`;

async function chooseFreePlay(page: Page) {
  await page.getByRole("button", { name: "Start analysis", exact: true }).click();
  await page.getByRole("button", { name: "Use free play", exact: true }).click();
  await expect(page.getByTestId("engine-status")).toHaveText("stopped");
}

test("assisted analysis: moves stay interactive, stale arrows clear, settings persist and stop/resume works", async ({ page }) => {
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: mockWorker }));
  await page.goto("/");
  await chooseFreePlay(page);
  await page.getByRole("button", { name: "Start analysis", exact: true }).click();
  await page.getByRole("button", { name: "Use assisted analysis", exact: true }).click();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-best-move", "e2e4");
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-best-move", "e7e5");
  await expect(page.getByTestId("engine-status")).toHaveText("ready");
  await expect(page.getByTestId("engine-best-move")).toContainText("e5");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Analysis preset", { exact: true }).selectOption("quick");
  await page.getByLabel("Principal variations count", { exact: true }).selectOption("5");
  await page.getByLabel("Show best-move arrow", { exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByLabel("Principal variations", { exact: true }).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByTestId("chessboard")).not.toHaveAttribute("data-best-move");
  await page.getByRole("button", { name: "Stop analysis", exact: true }).click();
  await page.getByRole("button", { name: "Undo move", exact: true }).click();
  await expect(page.getByTestId("engine-status")).toHaveText("stopped");
  await page.getByRole("button", { name: "Resume analysis", exact: true }).click();
  await expect(page.getByTestId("engine-best-move")).toContainText("e4");
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  await page.getByRole("button", { name: "Start analysis", exact: true }).click();
  await page.getByRole("button", { name: "Use free play", exact: true }).click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await expect(page.getByTestId("engine-status")).toHaveText("stopped");
  await page.reload();
  await chooseFreePlay(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Analysis preset", { exact: true })).toHaveValue("quick");
  await expect(page.getByLabel("Principal variations count", { exact: true })).toHaveValue("5");
  await expect(page.getByLabel("Show best-move arrow", { exact: true })).not.toBeChecked();
});

test("real local WASM returns a legal best move and permits board interaction", async ({ page }) => {
  test.setTimeout(60_000);
  const workers: string[] = []; page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto("/");
  await chooseFreePlay(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Analysis preset", { exact: true }).selectOption("quick");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Analyze Position", exact: true }).click();
  await expect(page.getByTestId("engine-status")).toHaveText("ready", { timeout: 40_000 });
  const best = await page.getByTestId("chessboard").getAttribute("data-best-move");
  expect(best).toBeTruthy();
  expect(new Chess(DEFAULT_POSITION).move({ from: best!.slice(0, 2), to: best!.slice(2, 4), promotion: best![4] })).toBeTruthy();
  expect(workers.filter((url) => url.includes("analysis-worker"))).toHaveLength(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Analysis preset", { exact: true }).selectOption("deep");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Analyze Position", exact: true }).click();
  await expect(page.getByTestId("engine-status")).toHaveText("analyzing");
  // A main-thread engine would delay animation callbacks for its 2-second search.
  const responsiveness = await page.evaluate(() => new Promise<number>((resolve) => {
    const started = performance.now(); let frames = 0;
    function tick() { if (++frames === 4) resolve(performance.now() - started); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  expect(responsiveness).toBeLessThan(1000);
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await expect(page.getByTestId("chessboard")).not.toHaveAttribute("data-best-move");
  await expect(page.getByTestId("engine-status")).toHaveText("stopped");
  const assets = await page.request.get("/engines/stockfish-19.0.0/manifest.json");
  expect(assets.ok()).toBe(true); expect(await assets.json()).toMatchObject({ package: "stockfish@19.0.0" });
});

test("real local WASM completes a game queue using the existing worker", async ({ page }) => {
  test.setTimeout(60_000);
  const workers: string[] = []; page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto("/"); await chooseFreePlay(page);
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill('[White "Real"]\n[Black "Engine"]\n1. e4 e5 *');
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open Real vs Engine", exact: true }).click();
  await page.getByRole("button", { name: "Analyze game", exact: true }).click();
  await page.getByLabel("Game analysis preset", { exact: true }).selectOption("quick");
  await page.getByRole("button", { name: "Start game analysis", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toHaveText("3 / 3 positions · completed", { timeout: 40_000 });
  await page.getByLabel("Navigate evaluation graph", { exact: true }).selectOption("1");
  const board = new Chess(); board.move("e4");
  const best = await page.getByTestId("chessboard").getAttribute("data-best-move");
  expect(best).toBeTruthy();
  expect(board.move({ from: best!.slice(0, 2), to: best!.slice(2, 4), promotion: best![4] })).toBeTruthy();
  // A short real search can legitimately return a bound instead of an exact loss.
  await expect(page.getByLabel("Played move evaluation")).toContainText("Played move: e4");
  await expect(page.getByLabel("Played move evaluation")).not.toContainText("Pending");
  expect(workers.filter((url) => url.includes("analysis-worker"))).toHaveLength(1);
});
