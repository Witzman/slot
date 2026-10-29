import { type Pusher, D, R, W, plateFront } from "../game/pusher";

const TOP = 1; // shelf margin above the plate, in units

export interface PusherCanvas {
  draw(p: Pusher, aim: number, live: boolean): void;
  /** field x of a pointer position in client px */
  xAt(clientX: number): number;
  resize(): void;
}

export function createPusherCanvas(canvas: HTMLCanvasElement): PusherCanvas {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas not available");
  let scale = 30;
  let cssW = 300;
  let cssH = 400;

  function resize(): void {
    const box = canvas.parentElement?.getBoundingClientRect();
    const availW = Math.max(220, Math.min(box?.width ?? 360, 520));
    const availH = Math.max(280, Math.min(innerHeight - 230, 640));
    scale = Math.min(availW / W, availH / (D + TOP + 0.6));
    cssW = Math.round(W * scale);
    cssH = Math.round((D + TOP + 0.6) * scale);
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const X = (x: number): number => x * scale;
  const Y = (y: number): number => (y + TOP) * scale;

  function coin(x: number, y: number, kind: string): void {
    const c = ctx!;
    const r = R * scale;
    c.beginPath();
    c.arc(X(x), Y(y), r, 0, Math.PI * 2);
    c.fillStyle = kind === "gold" ? "#ffcf3a" : kind === "prize" ? "#b46bff" : "#c9ced8";
    c.fill();
    c.lineWidth = Math.max(1, scale * 0.07);
    c.strokeStyle = kind === "gold" ? "#a87400" : kind === "prize" ? "#fff" : "#6b7280";
    c.stroke();
    c.beginPath();
    c.arc(X(x), Y(y), r * 0.6, 0, Math.PI * 2);
    c.strokeStyle = kind === "gold" ? "#fff2b0" : kind === "prize" ? "#e8d0ff" : "#eef1f7";
    c.stroke();
    if (kind === "prize") {
      c.fillStyle = "#fff";
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rr = i % 2 === 0 ? r * 0.55 : r * 0.2;
        c.lineTo(X(x) + Math.cos(a) * rr, Y(y) + Math.sin(a) * rr);
      }
      c.fill();
    }
  }

  return {
    resize,
    xAt: (clientX) => {
      const rect = canvas.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * W;
    },
    draw(p, aim, live) {
      const c = ctx!;
      c.clearRect(0, 0, cssW, cssH);
      const shelf = c.createLinearGradient(0, Y(0), 0, Y(D));
      shelf.addColorStop(0, "#2a1a45");
      shelf.addColorStop(1, "#3b2463");
      c.fillStyle = shelf;
      c.fillRect(0, Y(0), cssW, Y(D) - Y(0));
      c.fillStyle = "#0d0816";
      c.fillRect(0, Y(D), cssW, cssH - Y(D));
      c.fillStyle = "#ff3d81";
      c.fillRect(0, Y(D) - 2, cssW, 4);
      c.fillStyle = "#ffcc33";
      c.font = `${Math.round(scale * 0.5)}px system-ui`;
      c.textAlign = "center";
      c.fillText("PAYOUT ▼", cssW / 2, Y(D) + scale * 0.5);
      for (const k of p.coins) coin(k.x, k.y, k.kind);
      // the plate sits on top of the back of the shelf
      const f = plateFront(p.t);
      const plate = c.createLinearGradient(0, Y(0), 0, Y(f));
      plate.addColorStop(0, "#4a4f66");
      plate.addColorStop(1, "#8a90ab");
      c.fillStyle = plate;
      c.fillRect(0, Y(0), cssW, Y(f) - Y(0));
      c.fillStyle = "#cfd4ea";
      c.fillRect(0, Y(f) - 3, cssW, 3);
      if (live) {
        const ax = X(Math.min(W - R, Math.max(R, aim)));
        c.strokeStyle = "rgba(255,204,51,.6)";
        c.setLineDash([4, 4]);
        c.beginPath();
        c.moveTo(ax, Y(f));
        c.lineTo(ax, Y(D));
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = "#ffcc33";
        c.beginPath();
        c.moveTo(ax - 8, 2);
        c.lineTo(ax + 8, 2);
        c.lineTo(ax, 14);
        c.fill();
      }
    },
  };
}
