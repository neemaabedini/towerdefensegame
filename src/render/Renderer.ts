import { getAbility } from "../data/abilities";
import { getBuilding, scaledStats } from "../data/buildings";
import { getEnemy } from "../data/enemies";
import { getHero } from "../data/hero";
import { getUnit } from "../data/units";
import type {
  EnemyUnit,
  GameSnapshot,
  GarrisonUnit,
  HeroState,
  PlacedBuilding,
} from "../game/types";
import { buildAtlas, type SpriteAtlas } from "./sprites";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w: number;
  private h: number;
  private time = 0;
  private atlas: SpriteAtlas;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not supported");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.w = canvas.width;
    this.h = canvas.height;
    this.atlas = buildAtlas();
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__spriteAtlas = this.atlas;
    }
  }

  resizeToDisplay(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    // Keep design resolution aspect, fill available space
    const designW = 960;
    const designH = 540;
    const scale = Math.min(rect.width / designW, rect.height / designH);
    const cssW = Math.floor(designW * scale);
    const cssH = Math.floor(designH * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    // Internal resolution stays fixed for consistent game coords
    if (this.canvas.width !== designW || this.canvas.height !== designH) {
      this.canvas.width = designW;
      this.canvas.height = designH;
      this.w = designW;
      this.h = designH;
      // Resizing the backing store resets context state
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  canvasToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * this.w;
    const y = ((clientY - rect.top) / rect.height) * this.h;
    return { x, y };
  }

  draw(state: GameSnapshot, dt: number): void {
    this.time += dt;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    this.drawTerrain(state);
    this.drawPaths(state);
    this.drawObstacles(state);
    this.drawSpawns(state);
    this.drawSites(state);
    this.drawRanges(state);
    this.drawHqStopRing(state);
    this.drawBuildings(state);
    this.drawUnits(state);
    this.drawHero(state);
    this.drawEnemies(state);
    this.drawProjectiles(state);
    this.drawParticles(state);
    this.drawFloatingTexts(state);
    this.drawPhaseVignette(state);
  }

  /**
   * 2.5D ground paint: top-down coords stay flat for gameplay, but the
   * paint uses foreshortened diamonds, mesa bands, and soft height so the
   * battlefield reads with volume (not true 3D / no camera tilt).
   */
  private drawTerrain(state: GameSnapshot): void {
    const ctx = this.ctx;
    const isNight = state.phase === "night";
    const W = this.w;
    const H = this.h;

    // Deep base (ash / dusk soil)
    const base = ctx.createLinearGradient(0, 0, 0, H);
    if (isNight) {
      base.addColorStop(0, "#0b1424");
      base.addColorStop(0.45, "#0e1a2e");
      base.addColorStop(1, "#0a101c");
    } else {
      base.addColorStop(0, "#2a3a28");
      base.addColorStop(0.4, "#243424");
      base.addColorStop(1, "#1a261c");
    }
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // Distant ridge / mesa silhouettes (parallax-ish backdrop, pure paint)
    this.drawMesaBands(isNight);

    // Diamond ground tiles (foreshortened plate for 2.5D depth)
    const tileW = 56;
    const tileH = 28;
    for (let row = -1; row < H / tileH + 2; row++) {
      for (let col = -1; col < W / tileW + 2; col++) {
        const cx = col * tileW + (row % 2 === 0 ? 0 : tileW * 0.5);
        const cy = row * tileH * 0.5;
        const n = this.hash2(col + 17, row + 31);
        const shade = isNight
          ? 0.04 + n * 0.06
          : 0.05 + n * 0.08;
        const warm = n > 0.55;
        ctx.fillStyle = isNight
          ? warm
            ? `rgba(50, 72, 110, ${shade})`
            : `rgba(30, 48, 72, ${shade})`
          : warm
            ? `rgba(90, 110, 55, ${shade})`
            : `rgba(45, 70, 42, ${shade})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy - tileH * 0.5);
        ctx.lineTo(cx + tileW * 0.5, cy);
        ctx.lineTo(cx, cy + tileH * 0.5);
        ctx.lineTo(cx - tileW * 0.5, cy);
        ctx.closePath();
        ctx.fill();
        // Tiny top-edge highlight for fake height on some tiles
        if (n > 0.72) {
          ctx.strokeStyle = isNight
            ? "rgba(100, 140, 190, 0.07)"
            : "rgba(140, 170, 90, 0.1)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx - tileW * 0.35, cy - 2);
          ctx.lineTo(cx, cy - tileH * 0.42);
          ctx.lineTo(cx + tileW * 0.35, cy - 2);
          ctx.stroke();
        }
      }
    }

    // Soil blotches (irregular "high ground" islands)
    for (let i = 0; i < 18; i++) {
      const px = this.hash2(i * 3, 9) * W;
      const py = this.hash2(i * 5, 11) * H;
      const rx = 40 + this.hash2(i, 2) * 70;
      const ry = rx * (0.38 + this.hash2(i, 4) * 0.18);
      const elev = this.hash2(i, 7);
      ctx.fillStyle = isNight
        ? `rgba(25, 40, 65, ${0.12 + elev * 0.1})`
        : `rgba(55, 78, 40, ${0.14 + elev * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, elev * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Soft south rim shadow (objects "sit" on the plane)
      ctx.fillStyle = isNight
        ? "rgba(0, 0, 0, 0.12)"
        : "rgba(0, 0, 0, 0.1)";
      ctx.beginPath();
      ctx.ellipse(px, py + ry * 0.55, rx * 0.85, ry * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine grit (deterministic dither, not a flat grid)
    ctx.fillStyle = isNight
      ? "rgba(90, 120, 160, 0.07)"
      : "rgba(120, 140, 80, 0.08)";
    for (let i = 0; i < 220; i++) {
      const x = Math.floor(this.hash2(i, 41) * W);
      const y = Math.floor(this.hash2(i, 43) * H);
      const s = 1 + (i % 3 === 0 ? 1 : 0);
      ctx.fillRect(x, y, s, s);
    }
  }

  /** Far cliffs / mesa bands along the top and sides — pure decoration. */
  private drawMesaBands(isNight: boolean): void {
    const ctx = this.ctx;
    const W = this.w;
    const H = this.h;
    const ridges: Array<{ y: number; h: number; a: number }> = [
      { y: 0, h: 48, a: 0.35 },
      { y: 18, h: 36, a: 0.22 },
      { y: H - 40, h: 40, a: 0.18 },
    ];
    for (const ridge of ridges) {
      ctx.fillStyle = isNight
        ? `rgba(12, 20, 36, ${ridge.a})`
        : `rgba(18, 28, 16, ${ridge.a})`;
      ctx.beginPath();
      ctx.moveTo(0, ridge.y + ridge.h);
      let x = 0;
      let i = 0;
      while (x <= W) {
        const peak = ridge.y + this.hash2(i, Math.floor(ridge.y)) * ridge.h * 0.7;
        ctx.lineTo(x, peak);
        x += 28 + this.hash2(i + 3, 2) * 24;
        i++;
      }
      ctx.lineTo(W, ridge.y + ridge.h);
      ctx.closePath();
      ctx.fill();
      // Lit rim
      ctx.strokeStyle = isNight
        ? "rgba(70, 100, 140, 0.15)"
        : "rgba(100, 130, 70, 0.18)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      x = 0;
      i = 0;
      let first = true;
      while (x <= W) {
        const peak = ridge.y + this.hash2(i, Math.floor(ridge.y)) * ridge.h * 0.7;
        if (first) {
          ctx.moveTo(x, peak);
          first = false;
        } else ctx.lineTo(x, peak);
        x += 28 + this.hash2(i + 3, 2) * 24;
        i++;
      }
      ctx.stroke();
    }
  }

  /** Stable 0..1 hash from integer seeds (no Math.random — CD-20-safe paint). */
  private hash2(a: number, b: number): number {
    let n = (a * 374761393 + b * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967296;
  }

  /** Soft contact shadow on the ground plane (2.5D). */
  private drawGroundShadow(
    x: number,
    y: number,
    rx: number,
    ry: number,
    alpha = 0.28,
  ): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + ry * 0.15, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPaths(state: GameSnapshot): void {
    const ctx = this.ctx;
    const isNight = state.phase === "night";

    for (const spawn of state.level.spawns) {
      const path = state.level.paths[spawn.id];
      if (!path || path.length < 2) continue;

      // Build polyline including HQ terminus
      const pts = path.map((p) => ({ x: p.x, y: p.y }));
      pts.push({ x: state.level.hq.x, y: state.level.hq.y });

      // Embankment (wider, darker) — reads as a cut road bed
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = isNight
        ? "rgba(20, 14, 18, 0.55)"
        : "rgba(35, 28, 18, 0.45)";
      ctx.lineWidth = 22;
      this.strokePolyline(pts);

      // Dirt pack
      ctx.strokeStyle = isNight
        ? "rgba(90, 55, 48, 0.55)"
        : "rgba(120, 88, 52, 0.55)";
      ctx.lineWidth = 16;
      this.strokePolyline(pts);

      // Worn center (lighter, slightly recessed highlight)
      ctx.strokeStyle = isNight
        ? "rgba(140, 90, 70, 0.28)"
        : "rgba(168, 128, 78, 0.4)";
      ctx.lineWidth = 7;
      this.strokePolyline(pts);

      // Edge ruts
      ctx.strokeStyle = isNight
        ? "rgba(0, 0, 0, 0.2)"
        : "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 1.5;
      this.strokePolyline(pts);
    }
  }

  private strokePolyline(pts: Array<{ x: number; y: number }>): void {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]!.x, pts[i]!.y);
    }
    ctx.stroke();
  }

  /** Sprite path for terrain props; crystals get a pulsing glow behind. */
  private drawObstacleSprite(o: {
    x: number;
    y: number;
    r: number;
    kind: string;
  }): boolean {
    // "plasma" has no atlas entry yet (Step 5 cosmetics) — falls through to
    // the vector fallback below by design, same pipeline rule as everything
    // else (ROADMAP art pipeline: fallbacks first, per-entity sprite swap).
    let key: string | null = null;
    if (o.kind === "rock") {
      key = o.r <= 24 ? "rock:s:0" : o.r <= 31 ? "rock:m:0" : "rock:l:0";
    } else if (o.kind === "crystal") {
      key = o.r <= 17 ? "crystal:s:0" : "crystal:m:0";
    }
    if (!key) return false;
    const f = this.atlas.get(key);
    if (!f) return false;

    const ctx = this.ctx;
    // Contact shadow under sprite (2.5D)
    this.drawGroundShadow(o.x, o.y + 2, o.r * 1.05, o.r * 0.42, 0.32);

    if (o.kind === "crystal") {
      const glow = 0.22 + 0.14 * Math.sin(this.time * 1.5 + o.x);
      ctx.fillStyle = `rgba(77, 208, 225, ${glow})`;
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, o.r + 8, (o.r + 8) * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const flip = (o.x * 7 + o.y * 13) % 2 === 0;
    // Slight Y squash + lift so flat sprites read as standing on the plane
    ctx.save();
    ctx.translate(Math.round(o.x), Math.round(o.y));
    if (flip) ctx.scale(-1, 1);
    ctx.scale(1, 0.92);
    ctx.drawImage(
      this.atlas.canvas,
      f.sx,
      f.sy,
      f.sw,
      f.sh,
      -f.ax,
      -f.ay - 2,
      f.sw,
      f.sh,
    );
    ctx.restore();
    return true;
  }

  /**
   * Extruded rock mesa (2.5D): ground ellipse + side walls + lit top face.
   * Same footprint as gameplay collision radius — paint only.
   */
  private drawRock25d(o: { x: number; y: number; r: number }): void {
    const ctx = this.ctx;
    const seed = o.x * 7.3 + o.y * 13.7;
    const verts = 8;
    const elev = Math.max(8, o.r * 0.55);
    const top: Array<{ x: number; y: number }> = [];
    const base: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < verts; i++) {
      const a = (i / verts) * Math.PI * 2 - Math.PI / 2;
      const wobble = 0.72 + 0.28 * Math.abs(Math.sin(seed + i * 2.4));
      const rx = o.r * wobble;
      const ry = o.r * wobble * 0.62;
      base.push({
        x: o.x + Math.cos(a) * rx,
        y: o.y + Math.sin(a) * ry + 2,
      });
      top.push({
        x: o.x + Math.cos(a) * rx * 0.88 - elev * 0.08,
        y: o.y + Math.sin(a) * ry * 0.88 - elev,
      });
    }

    this.drawGroundShadow(o.x, o.y + 4, o.r * 1.15, o.r * 0.48, 0.35);

    // Side walls (back-to-front by average Y of edge)
    for (let i = 0; i < verts; i++) {
      const j = (i + 1) % verts;
      const midY = (base[i]!.y + base[j]!.y) * 0.5;
      const lit = midY < o.y; // upper edges catch light
      ctx.fillStyle = lit ? "#4a5560" : "#2a3238";
      ctx.beginPath();
      ctx.moveTo(base[i]!.x, base[i]!.y);
      ctx.lineTo(base[j]!.x, base[j]!.y);
      ctx.lineTo(top[j]!.x, top[j]!.y);
      ctx.lineTo(top[i]!.x, top[i]!.y);
      ctx.closePath();
      ctx.fill();
    }

    // Top plateau
    ctx.fillStyle = "#5c6b76";
    ctx.beginPath();
    ctx.moveTo(top[0]!.x, top[0]!.y);
    for (let i = 1; i < verts; i++) ctx.lineTo(top[i]!.x, top[i]!.y);
    ctx.closePath();
    ctx.fill();
    // Spec highlight
    ctx.fillStyle = "rgba(180, 195, 205, 0.22)";
    ctx.beginPath();
    ctx.moveTo(top[0]!.x, top[0]!.y);
    for (let i = 1; i < Math.ceil(verts / 2); i++) {
      ctx.lineTo(top[i]!.x, top[i]!.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** Rocky outcrops and mineral crystals — the natural barriers that shape the funnels */
  private drawObstacles(state: GameSnapshot): void {
    const ctx = this.ctx;
    // Painter's algorithm-ish: sort by Y so lower props cover upper ones
    const sorted = [...state.level.obstacles].sort((a, b) => a.y - b.y);
    for (const o of sorted) {
      if (o.kind === "rock") {
        // Large rocks: extruded 2.5D mesa; small: atlas sprite with shadow
        if (o.r >= 26) this.drawRock25d(o);
        else if (!this.drawObstacleSprite(o)) this.drawRock25d(o);
        continue;
      }
      if (this.drawObstacleSprite(o)) continue;
      if (o.kind === "plasma") {
        // Plasma Well: amber pool on the ground plane
        this.drawGroundShadow(o.x, o.y + 2, o.r * 1.3, o.r * 0.55, 0.25);
        const glow = 0.5 + 0.3 * Math.sin(this.time * 1.2 + o.x);
        const grad = ctx.createRadialGradient(
          o.x,
          o.y - 2,
          o.r * 0.1,
          o.x,
          o.y,
          o.r,
        );
        grad.addColorStop(0, `rgba(255, 202, 40, ${0.8 + glow * 0.15})`);
        grad.addColorStop(0.55, `rgba(239, 140, 20, ${0.45 + glow * 0.1})`);
        grad.addColorStop(1, `rgba(120, 50, 0, 0.15)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, o.r * 1.15, o.r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        // Raised rim
        ctx.strokeStyle = `rgba(255, 180, 60, ${0.45 + glow * 0.25})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, o.r * 1.15, o.r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(60, 30, 10, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(o.x, o.y + 1, o.r * 1.05, o.r * 0.48, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const t = (this.time * 0.55 + i / 4 + o.x * 0.01) % 1;
          ctx.fillStyle = `rgba(255, 230, 140, ${0.55 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(
            o.x + Math.sin(this.time * 2 + i * 3) * o.r * 0.35,
            o.y - t * o.r * 1.6 - 4,
            2 + (1 - t) * 2.5,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      } else {
        // Crystal cluster: ground glow + tall shards (2.5D)
        this.drawGroundShadow(o.x, o.y + 3, o.r * 1.2, o.r * 0.45, 0.28);
        const glow = 0.5 + 0.3 * Math.sin(this.time * 1.5 + o.x);
        ctx.fillStyle = `rgba(40, 160, 180, ${0.2 + glow * 0.15})`;
        ctx.beginPath();
        ctx.ellipse(o.x, o.y + 2, o.r * 1.1, o.r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        const shards: Array<[number, number, number, number]> = [
          [0, 0, 1.35, 0],
          [-o.r * 0.55, o.r * 0.15, 0.9, -0.35],
          [o.r * 0.55, o.r * 0.2, 1.0, 0.3],
        ];
        for (const [ox, oy, len, lean] of shards) {
          const bx = o.x + ox;
          const by = o.y + oy;
          const h = o.r * len;
          // Side face (darker)
          ctx.fillStyle = `rgba(20, 110, 130, ${0.65 + glow * 0.15})`;
          ctx.beginPath();
          ctx.moveTo(bx + lean * h * 0.2, by - h);
          ctx.lineTo(bx + h * 0.32, by + 2);
          ctx.lineTo(bx - h * 0.08, by + 2);
          ctx.closePath();
          ctx.fill();
          // Lit face
          ctx.fillStyle = `rgba(100, 230, 240, ${0.55 + glow * 0.25})`;
          ctx.beginPath();
          ctx.moveTo(bx + lean * h * 0.2, by - h);
          ctx.lineTo(bx - h * 0.08, by + 2);
          ctx.lineTo(bx - h * 0.35, by + 2);
          ctx.closePath();
          ctx.fill();
          // Specular edge
          ctx.strokeStyle = `rgba(220, 255, 255, ${0.35 + glow * 0.2})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(bx + lean * h * 0.2, by - h);
          ctx.lineTo(bx - h * 0.12, by);
          ctx.stroke();
        }
      }
    }
  }

  private drawSpawns(state: GameSnapshot): void {
    const ctx = this.ctx;
    const upcoming = new Set(state.upcomingSpawnIds);

    for (const spawn of state.level.spawns) {
      const active = upcoming.has(spawn.id);

      if (!active) {
        // Dormant spawn: foreshortened ground ring
        ctx.strokeStyle = "rgba(144, 164, 174, 0.28)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(spawn.x, spawn.y, 12, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(144, 164, 174, 0.12)";
        ctx.beginPath();
        ctx.ellipse(spawn.x, spawn.y, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Threat marker: pulsing ellipses on the ground plane (2.5D)
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      this.drawGroundShadow(spawn.x, spawn.y + 2, 16, 8, 0.2);
      ctx.strokeStyle = `rgba(239, 83, 80, ${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(spawn.x, spawn.y, 14, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(239, 83, 80, ${0.25 + pulse * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        spawn.x,
        spawn.y,
        20 + pulse * 5,
        10 + pulse * 2.5,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.fillStyle = "rgba(239, 83, 80, 0.35)";
      ctx.beginPath();
      ctx.ellipse(spawn.x, spawn.y, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Marching chevrons along the first path segment — "they come this way"
      const path = state.level.paths[spawn.id];
      if (path && path.length >= 2) {
        const dx = path[1]!.x - path[0]!.x;
        const dy = path[1]!.y - path[0]!.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const px = -uy;
        const py = ux;
        const march = (this.time * 36) % 26;
        ctx.strokeStyle = `rgba(239, 83, 80, ${0.4 + pulse * 0.35})`;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        for (let k = 0; k < 3; k++) {
          const along = 26 + march + k * 26;
          const cx = spawn.x + ux * along;
          const cy = spawn.y + uy * along;
          ctx.beginPath();
          ctx.moveTo(cx - ux * 8 + px * 7, cy - uy * 8 + py * 7);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx - ux * 8 - px * 7, cy - uy * 8 - py * 7);
          ctx.stroke();
        }
      }

      // Enemy count badge
      const count = state.upcomingSpawnCounts[spawn.id];
      if (count) {
        ctx.font = "bold 12px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(255, 205, 210, ${0.75 + pulse * 0.25})`;
        ctx.fillText(`×${count}`, spawn.x, spawn.y - 26);
      }
    }
  }

  private drawSites(state: GameSnapshot): void {
    if (state.phase !== "day" && state.phase !== "victory") return;
    const ctx = this.ctx;

    for (const site of state.sites) {
      if (site.buildingId) continue;
      const selected = site.id === state.selectedSiteId;
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 2.5 + site.x * 0.01);
      const catColor =
        site.category === "resource"
          ? "#4dd0e1"
          : site.category === "defense"
            ? "#90a4ae"
            : "#ce93d8";

      if (selected) this.drawFocusBrackets(site.x, site.y, 30);

      // Isometric build pad (foundation plate) — not a flat circle
      const hw = 26;
      const hh = 14;
      this.drawGroundShadow(site.x, site.y + 4, hw * 1.1, hh * 0.9, 0.22);

      // Pad top (diamond)
      ctx.fillStyle = selected
        ? `rgba(40, 70, 95, ${0.55 + pulse * 0.12})`
        : "rgba(30, 40, 48, 0.55)";
      ctx.beginPath();
      ctx.moveTo(site.x, site.y - hh);
      ctx.lineTo(site.x + hw, site.y);
      ctx.lineTo(site.x, site.y + hh);
      ctx.lineTo(site.x - hw, site.y);
      ctx.closePath();
      ctx.fill();

      // South face (extrusion)
      ctx.fillStyle = selected
        ? "rgba(20, 40, 55, 0.75)"
        : "rgba(12, 18, 22, 0.7)";
      ctx.beginPath();
      ctx.moveTo(site.x - hw, site.y);
      ctx.lineTo(site.x, site.y + hh);
      ctx.lineTo(site.x, site.y + hh + 5);
      ctx.lineTo(site.x - hw, site.y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(site.x + hw, site.y);
      ctx.lineTo(site.x, site.y + hh);
      ctx.lineTo(site.x, site.y + hh + 5);
      ctx.lineTo(site.x + hw, site.y + 5);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = selected ? "#4fc3f7" : catColor;
      ctx.lineWidth = selected ? 2.2 : 1.4;
      ctx.setLineDash(selected ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(site.x, site.y - hh);
      ctx.lineTo(site.x + hw, site.y);
      ctx.lineTo(site.x, site.y + hh);
      ctx.lineTo(site.x - hw, site.y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner diamond marker
      ctx.fillStyle = selected
        ? `rgba(79, 195, 247, ${0.75 + pulse * 0.2})`
        : "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.moveTo(site.x, site.y - 5);
      ctx.lineTo(site.x + 7, site.y);
      ctx.lineTo(site.x, site.y + 5);
      ctx.lineTo(site.x - 7, site.y);
      ctx.closePath();
      ctx.fill();

      // Category label
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.fillStyle = "rgba(200, 210, 230, 0.7)";
      ctx.textAlign = "center";
      ctx.fillText(site.category.toUpperCase(), site.x, site.y + 36);

      // Resource badge (C2/C7: numbers visible without hover) — how many
      // crystal/plasma nodes a mining building would see if built here.
      // Gated on the site actually OFFERING a matching mining option — a
      // site can incidentally have a crystal within another building's
      // hypothetical mining radius without ever offering one (e.g. Ridge
      // d5 sits near the Far Field but only offers gun_tower/garrison).
      const offersPlasma = site.options.some((id) => getBuilding(id).mining?.resource === "plasma");
      const offersMineral = site.options.some((id) => getBuilding(id).mining?.resource === "mineral");
      if (offersPlasma && site.resources.plasma > 0) {
        ctx.font = "bold 11px Segoe UI, sans-serif";
        ctx.fillStyle = "#ffb74d";
        ctx.fillText(`◆ ×${site.resources.plasma}`, site.x, site.y - 32);
      } else if (offersMineral && site.resources.mineral > 0) {
        ctx.font = "bold 11px Segoe UI, sans-serif";
        ctx.fillStyle = "#4dd0e1";
        ctx.fillText(`◆ ×${site.resources.mineral}`, site.x, site.y - 32);
      }
    }
  }

  private drawRanges(state: GameSnapshot): void {
    const ctx = this.ctx;

    // CD-58: pre-buy ghost at the selected empty site (dashed, slightly dimmer).
    const preview = state.rangePreview;
    if (preview && preview.range > 0) {
      ctx.strokeStyle = "rgba(79, 195, 247, 0.28)";
      ctx.fillStyle = "rgba(79, 195, 247, 0.05)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(preview.x, preview.y, preview.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Selected building: combat-accurate range (CD-59 — include globalStatMods).
    const id = state.selectedBuildingId;
    if (!id) return;
    const b = state.buildings.find((x) => x.id === id);
    if (!b) return;
    const def = getBuilding(b.defId);
    const stats = scaledStats(def, b.level, b.branchId, state.globalStatMods);
    if (stats.range <= 0) return;

    ctx.strokeStyle = "rgba(79, 195, 247, 0.35)";
    ctx.fillStyle = "rgba(79, 195, 247, 0.06)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, stats.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Faint dashed ring at the enemy stop distance around the HQ (see
   * resolveEnemyContact's `def.radius + 40` HQ engage check in Game.ts —
   * 52 approximates that with a typical enemy radius). Shown at night so
   * players can see where enemies will stand and siege, and during the
   * day only when the HQ is selected (kept deliberately subtle so it
   * doesn't compete with the red spawn warning markers).
   */
  private drawHqStopRing(state: GameSnapshot): void {
    const isNight = state.phase === "night";
    const isDaySelected =
      state.phase === "day" && state.selectedBuildingId === state.hqId;
    if (!isNight && !isDaySelected) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(239, 83, 80, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(state.level.hq.x, state.level.hq.y, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawBuildings(state: GameSnapshot): void {
    this.drawWrecks(state);
    // Painter's algorithm — lower on screen draws later (2.5D depth cue)
    const list = state.buildings
      .filter((b) => b.hp > 0)
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const b of list) {
      this.drawBuilding(b, state);
    }
  }

  /** Smoking rubble where a building fell tonight — rebuilt at dawn */
  private drawWrecks(state: GameSnapshot): void {
    const ctx = this.ctx;
    for (const w of state.wrecks) {
      const s = getBuilding(w.defId).size;
      // rubble mounds
      ctx.fillStyle = "#232a30";
      ctx.beginPath();
      ctx.ellipse(w.x - s * 0.3, w.y + s * 0.2, s * 0.55, s * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(w.x + s * 0.35, w.y + s * 0.3, s * 0.4, s * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#39434c";
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, s * 0.42, s * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      // rising smoke wisps
      for (let i = 0; i < 2; i++) {
        const t = (this.time * 0.7 + i * 0.5 + w.x * 0.01) % 1;
        ctx.fillStyle = `rgba(160, 160, 170, ${0.28 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(
          w.x + Math.sin(this.time * 2 + i * 3) * 4,
          w.y - s * 0.4 - t * 26,
          3 + t * 5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }

  private drawBuilding(b: PlacedBuilding, state: GameSnapshot): void {
    const ctx = this.ctx;
    const def = getBuilding(b.defId);
    const selected = b.id === state.selectedBuildingId;
    const s = def.size;

    // 2.5D contact shadow + isometric foundation pad
    this.drawGroundShadow(b.x, b.y + s * 0.35, s * 1.15, s * 0.48, 0.36);
    this.drawIsoFoundation(b.x, b.y + 2, s + 6, def.category, selected);

    if (selected) {
      this.drawFocusBrackets(b.x, b.y, s + 14);
    }

    if (!this.drawBuildingSprite(b, def.shape)) {
      switch (def.shape) {
        case "hq":
          this.drawHq(b.x, b.y, s, def.color, def.accent);
          break;
        case "tower":
          this.drawTower(b.x, b.y, s, def.color, def.accent);
          break;
        case "missile":
          this.drawMissile(b.x, b.y, s, def.color, def.accent);
          break;
        case "bunker":
          this.drawBunker(b.x, b.y, s, def.color, def.accent);
          break;
        case "tank":
          this.drawTank(b.x, b.y, s, def.color, def.accent);
          break;
        case "factory":
          this.drawFactory(b.x, b.y, s, def.color, def.accent);
          break;
        case "silo":
          this.drawSilo(b.x, b.y, s, def.color, def.accent);
          break;
        case "radar":
          this.drawRadar(b.x, b.y, s, def.color, def.accent);
          break;
        case "sniper":
          this.drawSniper(b.x, b.y, s, def.color, def.accent);
          break;
        case "tap":
          this.drawTap(b.x, b.y, s, def.color, def.accent);
          break;
      }
    }

    // CD-6: live barrel aim + muzzle flash on combat buildings (presentation).
    this.drawCombatAim(b, def);

    // HP bar
    if (b.hp < b.maxHp || b.isHq) {
      const bw = s * 1.8;
      const bh = 4;
      const bx = b.x - bw / 2;
      const by = b.y - s - 12;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx, by, bw, bh);
      const pct = Math.max(0, b.hp / b.maxHp);
      ctx.fillStyle =
        pct > 0.5 ? "#66bb6a" : pct > 0.25 ? "#ffb74d" : "#ef5350";
      ctx.fillRect(bx, by, bw * pct, bh);
    }

    // Level badge — the HQ can level now too (Command Post picks), so it
    // gets the same badge once it's above L1.
    if (b.level > 1) {
      ctx.fillStyle = "#1a2440";
      ctx.strokeStyle = "#4fc3f7";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x + s * 0.7, b.y - s * 0.7, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e8eefc";
      ctx.font = "bold 9px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(b.level), b.x + s * 0.7, b.y - s * 0.7);
      ctx.textBaseline = "alphabetic";
    }
  }

  /**
   * Isometric foundation plate under buildings. Pure paint — selection
   * radius / gameplay footprint unchanged.
   */
  private drawIsoFoundation(
    x: number,
    y: number,
    half: number,
    category: string,
    selected: boolean,
  ): void {
    const ctx = this.ctx;
    const hw = half * 1.05;
    const hh = half * 0.48;
    const fill =
      category === "defense"
        ? selected
          ? "rgba(70, 95, 110, 0.55)"
          : "rgba(50, 65, 75, 0.45)"
        : category === "production"
          ? selected
            ? "rgba(55, 90, 50, 0.5)"
            : "rgba(40, 65, 40, 0.4)"
          : selected
            ? "rgba(80, 50, 95, 0.5)"
            : "rgba(55, 35, 70, 0.4)";
    const stroke = selected
      ? "rgba(79, 195, 247, 0.7)"
      : category === "defense"
        ? "rgba(144, 164, 174, 0.4)"
        : category === "production"
          ? "rgba(129, 199, 132, 0.4)"
          : "rgba(206, 147, 216, 0.4)";

    // South faces (extrusion)
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x, y + hh + 4);
    ctx.lineTo(x - hw, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x, y + hh + 4);
    ctx.lineTo(x + hw, y + 4);
    ctx.closePath();
    ctx.fill();

    // Top diamond
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = selected ? 1.8 : 1.1;
    ctx.stroke();
  }

  /** Draw a building from the sprite atlas, with living-base overlays
   *  (radar sweep, HQ core glow) kept procedural on top. Returns false if
   *  no sprite exists so the vector fallback runs. */
  private drawBuildingSprite(b: PlacedBuilding, shape: string): boolean {
    const seed = Number(b.id.split("_")[1] ?? 0);
    const frame = Math.floor(this.time * 1.6 + seed) % 2;
    const f = this.atlas.get(`bld:${shape}:${frame}`);
    if (!f) return false;

    const ctx = this.ctx;
    // Slight vertical squash so atlas art sits on the foreshortened pad
    ctx.save();
    ctx.translate(Math.round(b.x), Math.round(b.y));
    ctx.scale(1, 0.94);
    ctx.drawImage(
      this.atlas.canvas,
      f.sx,
      f.sy,
      f.sw,
      f.sh,
      -f.ax,
      -f.ay - 1,
      f.sw,
      f.sh,
    );
    ctx.restore();

    // Living overlays that want smooth motion, not 2-frame ticks
    if (shape === "radar") {
      ctx.strokeStyle = "#ce93d8";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      const ang = this.time * 2.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y - 2, f.sh * 0.55, ang - 0.5, ang + 0.1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (shape === "hq") {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2);
      ctx.fillStyle = `rgba(100, 181, 246, ${0.18 + pulse * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 4, 10 + pulse * 3, 5 + pulse * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }

  /** Animated corner brackets marking the current selection (mouse or keyboard) */
  private drawFocusBrackets(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    const breathe = r + Math.sin(this.time * 5) * 2;
    const arm = Math.max(6, r * 0.35);
    ctx.strokeStyle = "#4fc3f7";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const cx = x + sx * breathe;
      const cy = y + sy * breathe;
      ctx.beginPath();
      ctx.moveTo(cx - sx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy - sy * arm);
      ctx.stroke();
    }
  }

  /** Command Post: wide pad, dome, side pods, antenna */
  private drawHq(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    // Landing pad
    ctx.fillStyle = "rgba(38, 50, 56, 0.8)";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.55, s * 1.25, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // Main body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - s * 0.95, y - s * 0.35, s * 1.9, s * 0.95, 6);
    ctx.fill();
    // Side pods
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.roundRect(x - s * 1.15, y - s * 0.1, s * 0.35, s * 0.55, 3);
    ctx.roundRect(x + s * 0.8, y - s * 0.1, s * 0.35, s * 0.55, 3);
    ctx.fill();
    // Dome
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.35, s * 0.62, s * 0.5, 0, Math.PI, 0);
    ctx.fill();
    // Dome window band
    ctx.fillStyle = "rgba(13, 24, 38, 0.7)";
    ctx.fillRect(x - s * 0.45, y - s * 0.55, s * 0.9, s * 0.16);
    // Antenna with blinking light
    ctx.strokeStyle = "#90a4ae";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.45, y - s * 0.7);
    ctx.lineTo(x + s * 0.45, y - s * 1.2);
    ctx.stroke();
    const blink = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 3));
    ctx.fillStyle = `rgba(239, 83, 80, ${blink})`;
    ctx.beginPath();
    ctx.arc(x + s * 0.45, y - s * 1.2, 3, 0, Math.PI * 2);
    ctx.fill();
    // Energy core
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2);
    ctx.fillStyle = `rgba(100, 181, 246, ${0.5 + pulse * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y + s * 0.15, 6 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Gun Tower: legged column with boxy head and twin angled barrels */
  private drawTower(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    // Splayed support legs
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55, y + s * 0.75);
    ctx.lineTo(x - s * 0.15, y + s * 0.1);
    ctx.moveTo(x + s * 0.55, y + s * 0.75);
    ctx.lineTo(x + s * 0.15, y + s * 0.1);
    ctx.stroke();
    // Column
    ctx.fillStyle = color;
    ctx.fillRect(x - s * 0.28, y - s * 0.2, s * 0.56, s * 0.85);
    // Turret head — barrels drawn live by drawCombatAim (CD-6).
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(x - s * 0.5, y - s * 0.62, s, s * 0.52, 4);
    ctx.fill();
  }

  /** Sniper Tower: tripod legs, compact body, one long thin barrel with a
   *  blinking scope glint mounted just behind the muzzle */
  private drawSniper(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    // Tripod legs
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55, y + s * 0.75);
    ctx.lineTo(x - s * 0.1, y + s * 0.1);
    ctx.moveTo(x + s * 0.55, y + s * 0.75);
    ctx.lineTo(x + s * 0.1, y + s * 0.1);
    ctx.moveTo(x, y + s * 0.8);
    ctx.lineTo(x, y + s * 0.1);
    ctx.stroke();
    // Compact body — long barrel drawn live by drawCombatAim (CD-6).
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.45, 4);
    ctx.fill();
    // Scope, glint blinks
    ctx.fillStyle = "#263238";
    ctx.beginPath();
    ctx.roundRect(x + s * 0.05, y - s * 0.55, s * 0.3, s * 0.18, 2);
    ctx.fill();
    const blink = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 4));
    ctx.globalAlpha = blink;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + s * 0.2, y - s * 0.46, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Missile Battery: pedestal with tilted 4-tube launcher rack, red warheads */
  private drawMissile(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    // Pedestal
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - s * 0.55, y + s * 0.05, s * 1.1, s * 0.55, 3);
    ctx.fill();
    // Launcher rack body — tubes/aim drawn live by drawCombatAim (CD-6).
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - s * 0.55, y - s * 0.55, s * 1.1, s * 0.7, 4);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.25, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Bunker: low sandbagged pillbox with dark firing slit */
  private drawBunker(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.45);
    ctx.lineTo(x - s * 0.65, y - s * 0.5);
    ctx.lineTo(x + s * 0.65, y - s * 0.5);
    ctx.lineTo(x + s, y + s * 0.45);
    ctx.closePath();
    ctx.fill();
    // Roof ridge
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(x - s * 0.65, y - s * 0.5, s * 1.3, s * 0.16);
    // Firing slit — gun drawn live by drawCombatAim (CD-6).
    ctx.fillStyle = "#141b1f";
    ctx.beginPath();
    ctx.roundRect(x - s * 0.5, y - s * 0.18, s, s * 0.22, 2);
    ctx.fill();
    // Sandbag bumps along the base
    ctx.fillStyle = accent;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(x + i * s * 0.38, y + s * 0.45, s * 0.16, Math.PI, 0);
      ctx.fill();
    }
  }

  /** Artillery Platform: deployed artillery — outriggers, hull, long elevated barrel */
  private drawTank(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    // Outrigger legs
    ctx.strokeStyle = "#263238";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, y + s * 0.1);
    ctx.lineTo(x - s * 1.0, y + s * 0.55);
    ctx.moveTo(x + s * 0.6, y + s * 0.1);
    ctx.lineTo(x + s * 1.0, y + s * 0.55);
    ctx.stroke();
    // Hull
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - s * 0.85, y - s * 0.25, s * 1.7, s * 0.65, 4);
    ctx.fill();
    // Turret ring — barrel drawn live by drawCombatAim (CD-6).
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(x - s * 0.1, y - s * 0.2, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Recoil piston detail
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x - s * 0.1, y - s * 0.2, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Barracks: blocky garrison with lit door, windows, and a flag */
  private drawFactory(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    // Main block
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - s, y - s * 0.5, s * 2, s * 1.15, 3);
    ctx.fill();
    // Roof band
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(x - s, y - s * 0.5, s * 2, s * 0.22);
    // Door (lit)
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(x - s * 0.2, y + s * 0.05, s * 0.4, s * 0.6, 2);
    ctx.fill();
    // Windows
    ctx.fillStyle = "rgba(255, 241, 118, 0.8)";
    ctx.fillRect(x - s * 0.75, y - s * 0.15, s * 0.28, s * 0.2);
    ctx.fillRect(x + s * 0.47, y - s * 0.15, s * 0.28, s * 0.2);
    // Flag pole
    ctx.strokeStyle = "#90a4ae";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.8, y - s * 0.5);
    ctx.lineTo(x + s * 0.8, y - s * 1.05);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.8, y - s * 1.05);
    ctx.lineTo(x + s * 1.15, y - s * 0.92);
    ctx.lineTo(x + s * 0.8, y - s * 0.8);
    ctx.closePath();
    ctx.fill();
  }

  /** Refinery: twin storage vats with connecting pipe and bubbling glow */
  private drawSilo(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    const vatW = s * 0.72;
    const vatH = s * 1.05;
    for (const vx of [x - s * 0.48, x + s * 0.48]) {
      // Vat body
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(vx - vatW / 2, y - vatH * 0.45, vatW, vatH, 4);
      ctx.fill();
      // Vat cap
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(vx, y - vatH * 0.45, vatW / 2, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ring seams
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(vx - vatW / 2, y);
      ctx.lineTo(vx + vatW / 2, y);
      ctx.moveTo(vx - vatW / 2, y + vatH * 0.28);
      ctx.lineTo(vx + vatW / 2, y + vatH * 0.28);
      ctx.stroke();
    }
    // Connecting pipe with valve
    ctx.strokeStyle = "#90a4ae";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.48, y - s * 0.1);
    ctx.lineTo(x + s * 0.48, y - s * 0.1);
    ctx.stroke();
    ctx.fillStyle = "#546e7a";
    ctx.beginPath();
    ctx.arc(x, y - s * 0.1, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
    // Bubbling glow above the left vat
    const bob = Math.sin(this.time * 3 + x) * 2;
    ctx.fillStyle = `rgba(255, 213, 79, ${0.35 + 0.25 * Math.sin(this.time * 4)})`;
    ctx.beginPath();
    ctx.arc(x - s * 0.48, y - vatH * 0.45 - 6 + bob, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Plasma Tap: squat drill housing over the well, bobbing pump arm with an
   *  amber cap, pulsing core glow. Vector fallback — Step 5 ships bld:tap:0|1. */
  private drawTap(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    // Base collar over the well
    ctx.fillStyle = "rgba(38, 50, 56, 0.8)";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.5, s * 0.95, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    // Housing
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - s * 0.55, y - s * 0.35, s * 1.1, s * 0.85, 6);
    ctx.fill();
    // Pump arm, bobs slowly
    const bob = Math.sin(this.time * 2.2 + x) * s * 0.08;
    ctx.strokeStyle = "#37474f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.35 + bob);
    ctx.lineTo(x, y + s * 0.15);
    ctx.stroke();
    // Amber cap
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.35 + bob, s * 0.32, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pulsing core glow
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
    ctx.fillStyle = `rgba(255, 167, 38, ${0.4 + pulse * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y + s * 0.05, 5 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Sensor Array: tripod-mounted dish with rotating sweep beam */
  private drawRadar(x: number, y: number, s: number, color: string, accent: string): void {
    const ctx = this.ctx;
    // Tripod
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y + s * 0.7);
    ctx.lineTo(x, y);
    ctx.moveTo(x + s * 0.5, y + s * 0.7);
    ctx.lineTo(x, y);
    ctx.moveTo(x, y + s * 0.75);
    ctx.lineTo(x, y);
    ctx.stroke();
    // Dish base
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.05, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // Tilted dish
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.35, s * 0.55, s * 0.28, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.35, s * 0.3, s * 0.14, -0.35, 0, Math.PI * 2);
    ctx.fill();
    // Feed antenna + blinking tip
    ctx.strokeStyle = "#eceff1";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.35);
    ctx.lineTo(x + s * 0.3, y - s * 0.75);
    ctx.stroke();
    const blink = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 4));
    ctx.fillStyle = `rgba(206, 147, 216, ${blink})`;
    ctx.beginPath();
    ctx.arc(x + s * 0.3, y - s * 0.75, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Rotating sweep beam
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    const ang = this.time * 2.5;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.05, s * 1.05, ang - 0.5, ang + 0.1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Garrison squad members (Batch 3) — a thin layer between buildings and
   *  enemies so units read as standing in front of their bunker. */
  private drawUnits(state: GameSnapshot): void {
    const ctx = this.ctx;
    const list = state.units
      .filter((u) => u.hp > 0)
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const u of list) {
      const def = getUnit(u.unitDefId);
      const r = def.radius;

      this.drawGroundShadow(u.x, u.y + r * 0.55, r * 1.05, r * 0.4, 0.32);

      if (this.drawUnitSprite(u, state)) {
        this.drawUnitHpBar(u, r);
        continue;
      }

      // Vector fallback: 2.5D infantry silhouette
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + r * 0.15, r * 0.7, r * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = def.accent;
      ctx.beginPath();
      ctx.ellipse(u.x, u.y - r * 0.55, r * 0.45, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // feet
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(u.x - r * 0.25, u.y + r * 0.7, r * 0.25, r * 0.12, 0, 0, Math.PI * 2);
      ctx.ellipse(u.x + r * 0.25, u.y + r * 0.7, r * 0.25, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      this.drawUnitHpBar(u, r);
    }
  }

  /** Draw a garrison unit from the sprite atlas, facing whichever live
   *  enemy is nearest (best-effort "face the fight" — the renderer doesn't
   *  see the sim's exact target selection). Returns false if no sprite
   *  exists so the vector fallback runs. */
  private drawUnitSprite(u: GarrisonUnit, state: GameSnapshot): boolean {
    const seed = Number(u.id.split("_")[1] ?? 0);
    const frame = Math.floor(this.time * 4 + seed) % 2;
    const flash = u.hitTimer > 0 ? ":flash" : "";
    const f = this.atlas.get(`unit:${u.unitDefId}:${frame}${flash}`);
    if (!f) return false;

    let flip = false;
    let bestD = Infinity;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < bestD) {
        bestD = d;
        flip = e.x < u.x - 1;
      }
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(Math.round(u.x), Math.round(u.y));
    if (flip) ctx.scale(-1, 1);
    // Slight foreshorten so infantry stand on the ground plane
    ctx.scale(1, 0.92);
    ctx.drawImage(
      this.atlas.canvas,
      f.sx,
      f.sy,
      f.sw,
      f.sh,
      -f.ax,
      -f.ay - 1,
      f.sw,
      f.sh,
    );
    ctx.restore();
    return true;
  }

  private drawUnitHpBar(u: GarrisonUnit, r: number): void {
    if (u.hp >= u.maxHp) return;
    const ctx = this.ctx;
    const bw = r * 2;
    const bx = u.x - bw / 2;
    const by = u.y - r - 8;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(bx, by, bw, 2.5);
    ctx.fillStyle = "#66bb6a";
    ctx.fillRect(bx, by, bw * (u.hp / u.maxHp), 2.5);
  }

  /** Hero draw pass (CD-29 Slice 1) — vector fallback only this slice, no
   *  atlas entry yet (design §13; a `hero:<weapon>:<frame>` key is reserved
   *  for CD-32). Drivable day and night (CD-29 day-positioning): same figure
   *  at the HQ, just no HP bar and no combat happening behind it. */
  private drawHero(state: GameSnapshot): void {
    const hero = state.hero;
    if (!hero) return;
    const def = getHero(hero.defId);
    const ctx = this.ctx;
    const r = def.radius;

    // Downed marker: out until dawn (design §5) — a grey X at the last
    // position instead of the fighting figure. parkHero() always revives
    // the hero (alive: true) before the day begins, so this can only be
    // seen mid-night.
    if (!hero.alive) {
      ctx.strokeStyle = "#9e9e9e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hero.x - r, hero.y - r);
      ctx.lineTo(hero.x + r, hero.y + r);
      ctx.moveTo(hero.x + r, hero.y - r);
      ctx.lineTo(hero.x - r, hero.y + r);
      ctx.stroke();
      return;
    }

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(hero.x, hero.y + r * 0.6, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // CD-40: faint ability radius when primary active is ready (night only).
    if (state.phase === "night" && hero.deployed) {
      this.drawAbilityReadyRing(hero);
    }

    // Imported sprite first (CD-32 pipeline: hero:<frame> baked from
    // tools/import-hero-sheet.mjs); vector figure below stays the fallback.
    if (this.drawHeroSprite(hero)) {
      if (hero.deployed) this.drawHeroHpBar(hero, r);
      return;
    }

    // Distinct commander figure: body circle + a visor/accent stripe that
    // flips with facing so movement direction reads without an atlas sprite.
    ctx.save();
    ctx.translate(hero.x, hero.y);
    if (hero.facing < 0) ctx.scale(-1, 1);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.accent;
    ctx.fillRect(-r * 0.15, -r * 0.7, r * 0.9, r * 0.35);
    ctx.restore();

    if (hero.deployed) this.drawHeroHpBar(hero, r);
  }

  /** Draw the hero from the imported sprite sheet (atlas keys hero:0/1).
   *  Returns false when no sheet has been imported — the vector fallback
   *  in drawHero keeps working, per the per-entity-swap rule. Two-frame
   *  idle cycle like units; flips with facing; anchored at center like
   *  every other atlas sprite. */
  private drawHeroSprite(hero: HeroState): boolean {
    // 8-direction standing set first (hero:d<octant>, true per-direction art
    // — no mirroring, so asymmetric details like the gun hand stay correct).
    const dirFrame = this.atlas.get(`hero:d${hero.dir}`);
    if (dirFrame) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(Math.round(hero.x), Math.round(hero.y));
      ctx.drawImage(
        this.atlas.canvas,
        dirFrame.sx, dirFrame.sy, dirFrame.sw, dirFrame.sh,
        -dirFrame.ax, -dirFrame.ay, dirFrame.sw, dirFrame.sh,
      );
      ctx.restore();
      return true;
    }
    // 2-frame idle set (hero:0/1) with facing flip.
    const frame = Math.floor(this.time * 4) % 2;
    const f = this.atlas.get(`hero:${frame}`);
    if (!f) return false;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(Math.round(hero.x), Math.round(hero.y));
    if (hero.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(this.atlas.canvas, f.sx, f.sy, f.sw, f.sh, -f.ax, -f.ay, f.sw, f.sh);
    ctx.restore();
    return true;
  }

  private drawHeroHpBar(hero: HeroState, r: number): void {
    if (hero.hp >= hero.maxHp) return;
    const ctx = this.ctx;
    const bw = r * 2.4;
    const bx = hero.x - bw / 2;
    const by = hero.y - r - 12;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = "#66bb6a";
    ctx.fillRect(bx, by, bw * (hero.hp / hero.maxHp), 3);
  }

  /** Soft ring for ready self-cast (CD-40) — telegraph radius without hover. */
  private drawAbilityReadyRing(hero: HeroState): void {
    const hDef = getHero(hero.defId);
    const abilityId = hDef.abilities[0];
    if (!abilityId) return;
    if ((hero.abilityCooldowns[abilityId] ?? 0) > 0) return;
    const ab = getAbility(abilityId);
    const ctx = this.ctx;
    const pulse = 0.35 + 0.15 * Math.sin(this.time * 3);
    ctx.strokeStyle = `rgba(255, 202, 40, ${pulse})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(hero.x, hero.y, ab.radius, ab.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawEnemies(state: GameSnapshot): void {
    const ctx = this.ctx;
    const list = state.enemies
      .filter((e) => e.hp > 0)
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const e of list) {
      const def = getEnemy(e.defId);
      const r = def.radius;
      const flyer = def.archetype === "flyer";

      this.drawGroundShadow(
        e.x,
        e.y + r * (flyer ? 1.15 : 0.55),
        r * (flyer ? 0.75 : 1.05),
        r * (flyer ? 0.28 : 0.4),
        flyer ? 0.2 : 0.32,
      );

      if (this.drawEnemySprite(e)) {
        this.drawEnemyHpBar(e, r);
        continue;
      }

      if (def.archetype === "flyer") {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - r);
        ctx.lineTo(e.x + r, e.y);
        ctx.lineTo(e.x, e.y + r * 0.5);
        ctx.lineTo(e.x - r, e.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = def.accent;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 2, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (def.archetype === "boss") {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = def.accent;
        ctx.lineWidth = 3;
        ctx.stroke();
        // Spikes
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + this.time;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * r * 0.7, e.y + Math.sin(a) * r * 0.7);
          ctx.lineTo(e.x + Math.cos(a) * (r + 8), e.y + Math.sin(a) * (r + 8));
          ctx.stroke();
        }
      } else if (def.archetype === "brute" || def.archetype === "siege") {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.roundRect(e.x - r, e.y - r * 0.75, r * 2, r * 1.5, 4);
        ctx.fill();
        ctx.fillStyle = def.accent;
        ctx.fillRect(e.x - r * 0.4, e.y - r * 0.3, r * 0.8, r * 0.5);
      } else if (def.archetype === "ranged") {
        // Small spiky wedge — no sprite builder exists for this archetype
        // yet, so this vector fallback is the shipped look (Spitter).
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(e.x + r, e.y);
        ctx.lineTo(e.x - r * 0.3, e.y - r * 0.75);
        ctx.lineTo(e.x - r * 0.6, e.y);
        ctx.lineTo(e.x - r * 0.3, e.y + r * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = def.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Back spikes
        for (let i = 0; i < 3; i++) {
          const a = ((i - 1) / 3) * Math.PI * 0.8 + Math.PI;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * r * 0.4, e.y + Math.sin(a) * r * 0.4);
          ctx.lineTo(e.x + Math.cos(a) * (r + 5), e.y + Math.sin(a) * (r + 5));
          ctx.strokeStyle = def.accent;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = def.accent;
        ctx.beginPath();
        ctx.arc(e.x + r * 0.25, e.y - r * 0.2, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      this.drawEnemyHpBar(e, r);
    }
  }

  /** Draw an enemy from the sprite atlas. Returns false if no sprite exists
   *  (renderer falls back to the vector shapes). */
  private drawEnemySprite(e: EnemyUnit): boolean {
    const def = getEnemy(e.defId);
    const flyer = def.archetype === "flyer";

    // Walk cycle: faster enemies (and flapping flyers) animate faster;
    // per-enemy offset so squads don't march in lockstep
    const seed = Number(e.id.split("_")[1] ?? 0);
    const rate = flyer ? 9 : Math.max(3, def.speed / 9);
    const frame = Math.floor(this.time * rate + seed) % 2;
    const flash = e.hitTimer > 0 ? ":flash" : "";
    const f = this.atlas.get(`${e.defId}:${frame}${flash}`);
    if (!f) return false;

    // Face the direction of travel (sprites are authored facing right)
    const target = e.path[Math.min(e.pathIndex, e.path.length - 1)];
    const flip = target !== undefined && target.x < e.x - 1;

    const bob = flyer ? Math.sin(this.time * 5 + seed) * 2.5 - 5 : 0;
    const dx = Math.round(e.x);
    const dy = Math.round(e.y + bob);

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(dx, dy);
    if (flip) ctx.scale(-1, 1);
    if (!flyer) ctx.scale(1, 0.92);
    ctx.drawImage(
      this.atlas.canvas,
      f.sx,
      f.sy,
      f.sw,
      f.sh,
      -f.ax,
      -f.ay - (flyer ? 0 : 1),
      f.sw,
      f.sh,
    );
    ctx.restore();
    return true;
  }

  private drawEnemyHpBar(e: EnemyUnit, r: number): void {
    if (e.hp >= e.maxHp) return;
    const ctx = this.ctx;
    const bw = r * 2.2;
    const bx = e.x - bw / 2;
    const by = e.y - r - 10;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = "#ef5350";
    ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 3);
  }

  private drawProjectiles(state: GameSnapshot): void {
    const ctx = this.ctx;
    for (const p of state.projectiles) {
      if (!p.alive) continue;
      const isEnemy = p.faction === "enemy";
      const style = p.style ?? (isEnemy ? "bolt" : "bullet");
      const frame = style === "bolt" ? Math.floor(this.time * 12) % 2 : 0;
      const f = this.atlas.get(`fx:${style}:${frame}`);
      const ang = Math.atan2(p.targetY - p.y, p.targetX - p.x);

      // Soft trail behind the shot (reads motion between sprite frames).
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = isEnemy ? 1.5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      const trail = style === "missile" ? 18 : style === "shell" ? 14 : 10;
      ctx.lineTo(p.x - Math.cos(ang) * trail, p.y - Math.sin(ang) * trail);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (f) {
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.rotate(ang);
        ctx.drawImage(
          this.atlas.canvas,
          f.sx,
          f.sy,
          f.sw,
          f.sh,
          -f.ax,
          -f.ay,
          f.sw,
          f.sh,
        );
        ctx.restore();
      } else {
        // Fallback if atlas missing a frame.
        const r = isEnemy ? 2.5 : 4;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * CD-6: rotating barrel overlay + muzzle flash for combat buildings.
   * Sits on top of atlas/vector body art so aim tracks live targets without
   * baking N orientation frames into the atlas.
   */
  private drawCombatAim(b: PlacedBuilding, def: ReturnType<typeof getBuilding>): void {
    if (def.damage <= 0 || def.fireRate <= 0) return;
    // Production / sensor shapes never aim.
    if (
      def.shape === "silo" ||
      def.shape === "factory" ||
      def.shape === "radar" ||
      def.shape === "tap" ||
      def.shape === "hq"
    ) {
      return;
    }

    const ctx = this.ctx;
    const s = def.size;
    const barrelLen =
      def.shape === "sniper"
        ? s * 1.55
        : def.shape === "tank"
          ? s * 1.35
          : def.shape === "missile"
            ? s * 1.1
            : s * 0.95;
    const pivotY =
      def.shape === "bunker"
        ? -s * 0.1
        : def.shape === "tank"
          ? -s * 0.22
          : -s * 0.32;

    ctx.save();
    ctx.translate(b.x, b.y + pivotY);
    ctx.rotate(b.aimAngle);

    // Barrel body
    ctx.fillStyle = "#1a2228";
    const thick = def.shape === "sniper" ? 3 : 5;
    ctx.fillRect(2, -thick / 2, barrelLen, thick);
    // Accent tip / muzzle brake
    ctx.fillStyle = def.accent;
    ctx.fillRect(barrelLen - 3, -thick / 2 - 1.5, 5, thick + 3);
    if (def.shape === "missile") {
      // Second tube hint for multi-rack batteries
      ctx.fillStyle = "#263238";
      ctx.fillRect(4, thick / 2 + 1, barrelLen * 0.7, 3);
    }

    // Muzzle flash at barrel tip
    if (b.muzzleFlash > 0) {
      const t = Math.min(1, b.muzzleFlash / 0.1);
      const frame = t > 0.5 ? 0 : 1;
      const mf = this.atlas.get(`fx:muzzle:${frame}`);
      if (mf) {
        const scale = 0.7 + 0.5 * t;
        ctx.globalAlpha = 0.55 + 0.45 * t;
        ctx.drawImage(
          this.atlas.canvas,
          mf.sx,
          mf.sy,
          mf.sw,
          mf.sh,
          barrelLen + 2 - (mf.ax * scale),
          -(mf.ay * scale),
          mf.sw * scale,
          mf.sh * scale,
        );
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = `rgba(255, 235, 100, ${0.4 + 0.6 * t})`;
        ctx.beginPath();
        ctx.arc(barrelLen + 4, 0, 4 + 5 * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawParticles(state: GameSnapshot): void {
    const ctx = this.ctx;
    for (const p of state.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloatingTexts(state: GameSnapshot): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.font = "bold 13px Segoe UI, sans-serif";
    for (const ft of state.floatingTexts) {
      const a = Math.max(0, ft.life / ft.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawPhaseVignette(state: GameSnapshot): void {
    if (state.phase !== "night") return;
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      this.w / 2,
      this.h / 2,
      this.h * 0.2,
      this.w / 2,
      this.h / 2,
      this.w * 0.7,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(10, 5, 30, 0.35)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}
