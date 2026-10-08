"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KnowledgeWeb, WebEdge, WebNode } from "@/lib/web";

// Small hand-rolled force layout — node counts here are tens, not thousands,
// and the emergent (non-hierarchical) shape is the point of this view.
interface Sim {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const W = 1100;
const H = 700;
const TICKS = 320;

function runLayout(nodes: WebNode[], edges: WebEdge[]): Map<string, Sim> {
  const sim = new Map<string, Sim>();
  const n = nodes.length;
  nodes.forEach((node, i) => {
    // Seed on a circle, same-course nodes adjacent, deterministic.
    const angle = (2 * Math.PI * i) / Math.max(n, 1);
    sim.set(node.id, {
      x: W / 2 + Math.cos(angle) * 220,
      y: H / 2 + Math.sin(angle) * 190,
      vx: 0,
      vy: 0,
    });
  });

  const links = edges
    .map((e) => ({ a: sim.get(e.source), b: sim.get(e.target), bridge: e.kind === "bridge" }))
    .filter((l): l is { a: Sim; b: Sim; bridge: boolean } => !!l.a && !!l.b);

  for (let t = 0; t < TICKS; t++) {
    const cool = 1 - t / TICKS;
    // Pairwise repulsion.
    const list = [...sim.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 80);
        const f = (5200 / d2) * cool;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
    }
    // Springs along edges (bridges slightly longer — they span subjects).
    for (const { a, b, bridge } of links) {
      const rest = bridge ? 240 : 120;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = ((d - rest) / d) * 0.02 * cool;
      dx *= f;
      dy *= f;
      a.vx += dx;
      a.vy += dy;
      b.vx -= dx;
      b.vy -= dy;
    }
    // Gentle centering + integrate.
    for (const s of sim.values()) {
      s.vx += (W / 2 - s.x) * 0.0012;
      s.vy += (H / 2 - s.y) * 0.0012;
      s.x = Math.min(W - 40, Math.max(40, s.x + s.vx));
      s.y = Math.min(H - 30, Math.max(30, s.y + s.vy));
      s.vx *= 0.6;
      s.vy *= 0.6;
    }
  }
  return sim;
}

export default function KnowledgeWebView({ web }: { web: KnowledgeWeb }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, Sim> | null>(null);
  const layoutKey = useRef("");

  const key = web.nodes.map((n) => n.id).join("|");
  useEffect(() => {
    if (layoutKey.current === key) return;
    layoutKey.current = key;
    setPositions(runLayout(web.nodes, web.edges));
  }, [key, web.nodes, web.edges]);

  const byId = useMemo(() => new Map(web.nodes.map((n) => [n.id, n])), [web.nodes]);
  const selectedNode = selected ? byId.get(selected) ?? null : null;
  const selectedEdges = useMemo(
    () =>
      selected
        ? web.edges.filter((e) => e.source === selected || e.target === selected)
        : [],
    [selected, web.edges]
  );

  const courseIndex = new Map(web.courses.map((c, i) => [c.id, i]));

  return (
    <div className="web-shell">
      <header className="web-header">
        <div>
          <Link href="/" className="home-link">
            ← Curio
          </Link>
          <h1>Your knowledge web</h1>
          <p className="map-sub">
            {web.earnedCount} demonstrated · {web.encounteredCount - web.earnedCount} encountered ·
            concepts enter when you demonstrate them, not when a book contains them
          </p>
        </div>
        <div className="map-legend">
          {web.courses.map((c) => (
            <span key={c.id} className="legend-item">
              <i className={`web-dot course-${courseIndex.get(c.id)}`} />
              {c.title.split(":")[0]}
            </span>
          ))}
          <span className="legend-item">
            <i className="web-dot web-dot-faint" /> encountered, not yet earned
          </span>
        </div>
      </header>

      {web.encounteredCount === 0 ? (
        <p className="web-empty">
          Nothing here yet — the web grows as you demonstrate concepts. Ask, practise, review.
        </p>
      ) : (
        <div className="web-canvas">
          <svg viewBox={`0 0 ${W} ${H}`} className="web-svg">
            {positions &&
              web.edges.map((edge, i) => {
                const a = positions.get(edge.source);
                const b = positions.get(edge.target);
                if (!a || !b) return null;
                const active =
                  !selected || edge.source === selected || edge.target === selected;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={`web-edge ${edge.kind === "bridge" ? "web-bridge" : ""} ${
                      active ? "" : "web-edge-dim"
                    }`}
                  />
                );
              })}
            {positions &&
              web.nodes.map((node) => {
                const p = positions.get(node.id);
                if (!p) return null;
                const dim =
                  selected &&
                  selected !== node.id &&
                  !selectedEdges.some((e) => e.source === node.id || e.target === node.id);
                return (
                  <g
                    key={node.id}
                    transform={`translate(${p.x}, ${p.y})`}
                    className={`web-node ${dim ? "web-node-dim" : ""}`}
                    onClick={() => setSelected(selected === node.id ? null : node.id)}
                  >
                    <circle
                      r={node.earned ? 9 : 5}
                      className={`web-circle course-${courseIndex.get(node.course)} ${
                        node.earned ? "" : "web-circle-faint"
                      } ${selected === node.id ? "web-circle-selected" : ""}`}
                    />
                    <text y={node.earned ? -14 : -10} className="web-label">
                      {node.name.length > 24 ? `${node.name.slice(0, 23)}…` : node.name}
                    </text>
                  </g>
                );
              })}
          </svg>
        </div>
      )}

      {selectedNode && (
        <aside className="map-detail">
          <button className="detail-close" onClick={() => setSelected(null)}>
            ×
          </button>
          <span className={`detail-standing standing-${selectedNode.mastery}`}>
            {selectedNode.mastery}
          </span>
          <h2>{selectedNode.name}</h2>
          <p className="detail-desc">{selectedNode.courseTitle}</p>
          <h3>Connections</h3>
          <ul className="detail-edges">
            {selectedEdges.map((edge, i) => {
              const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
              const other = byId.get(otherId);
              return (
                <li key={i}>
                  <button onClick={() => setSelected(otherId)}>{other?.name ?? otherId}</button>
                  <span className="detail-edge-type">
                    {edge.kind === "bridge" ? `bridge · ${edge.type}` : edge.type}
                  </span>
                  <span className="detail-evidence">{edge.evidence}</span>
                </li>
              );
            })}
            {selectedEdges.length === 0 && (
              <li className="detail-evidence">No links yet among what you&apos;ve encountered.</li>
            )}
          </ul>
          <h3>Go there</h3>
          <Link
            href={`/read/${selectedNode.course}/${selectedNode.chapter}`}
            className="plan-item-label"
          >
            Open the chapter →
          </Link>
        </aside>
      )}
    </div>
  );
}
