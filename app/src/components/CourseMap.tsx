"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { NODE_H, NODE_W, type CourseMap, type MapEdge, type MapNode } from "@/lib/map-types";

const STANDING_LABEL: Record<string, string> = {
  unseen: "not yet met",
  exposed: "exposed",
  shaky: "shaky",
  developing: "developing",
  solid: "solid",
};

const EDGE_LABEL: Record<string, string> = {
  prerequisite_of: "needed for",
  builds_on: "builds on",
  contrasts_with: "contrasts with",
  commonly_confused_with: "often confused with",
};

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Same column → arc around the nodes between; different columns → flat bezier. */
function edgePath(a: MapNode, b: MapNode): string {
  const sameColumn = a.x === b.x;
  if (sameColumn) {
    const x = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const y2 = b.y + NODE_H / 2;
    const bulge = Math.min(70, 22 + Math.abs(y2 - y1) * 0.28);
    return `M ${x} ${y1} C ${x + bulge} ${y1}, ${x + bulge} ${y2}, ${x} ${y2}`;
  }
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

export default function CourseMapView({ map }: { map: CourseMap }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map.nodes]);
  const focus = hovered ?? selected;

  const related = useMemo(() => {
    if (!focus) return null;
    const ids = new Set<string>([focus]);
    for (const e of map.edges) {
      if (e.source === focus) ids.add(e.target);
      if (e.target === focus) ids.add(e.source);
    }
    return ids;
  }, [focus, map.edges]);

  const selectedNode = selected ? byId.get(selected) ?? null : null;
  const incoming: MapEdge[] = selected ? map.edges.filter((e) => e.target === selected) : [];
  const outgoing: MapEdge[] = selected ? map.edges.filter((e) => e.source === selected) : [];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of map.nodes) c[n.standing] = (c[n.standing] ?? 0) + 1;
    return c;
  }, [map.nodes]);

  return (
    <div className="map-shell">
      <header className="map-header">
        <div>
          <Link href="/" className="home-link">
            ← Curio
          </Link>
          <h1>{map.courseTitle}</h1>
          <p className="map-sub">
            {map.nodes.length} concepts · {map.edges.length} links ·{" "}
            {["solid", "developing", "shaky", "exposed", "unseen"]
              .filter((s) => counts[s])
              .map((s) => `${counts[s]} ${STANDING_LABEL[s]}`)
              .join(" · ")}
          </p>
        </div>
        <div className="map-legend">
          {["solid", "developing", "shaky", "exposed", "unseen"].map((s) => (
            <span key={s} className="legend-item">
              <i className={`legend-dot standing-${s}`} />
              {STANDING_LABEL[s]}
            </span>
          ))}
          <span className="legend-item">
            <i className="legend-dot legend-ready" />
            ready to learn
          </span>
        </div>
      </header>

      <div className="map-canvas">
        <svg
          width={map.width}
          height={map.height}
          viewBox={`0 0 ${map.width} ${map.height}`}
          className="map-svg"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
            </marker>
          </defs>

          {map.columns.map((col) => (
            <text key={col.id} x={col.x} y={38} className="map-column-title">
              Chapter {col.number} · {col.title}
            </text>
          ))}

          <g className="map-edges">
            {map.edges.map((edge, i) => {
              const a = byId.get(edge.source);
              const b = byId.get(edge.target);
              if (!a || !b) return null;
              const active = !related || (related.has(edge.source) && related.has(edge.target));
              const touchesFocus = focus && (edge.source === focus || edge.target === focus);
              return (
                <path
                  key={`${edge.source}-${edge.target}-${edge.type}-${i}`}
                  d={edgePath(a, b)}
                  className={`map-edge edge-${edge.type} ${
                    touchesFocus ? "edge-focus" : active ? "" : "edge-dim"
                  }`}
                  markerEnd="url(#arrow)"
                />
              );
            })}
          </g>

          <g className="map-nodes">
            {map.nodes.map((node) => {
              const dim = related ? !related.has(node.id) : false;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className={`map-node ${dim ? "node-dim" : ""} ${
                    selected === node.id ? "node-selected" : ""
                  }`}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(selected === node.id ? null : node.id)}
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={7}
                    className={`node-box standing-${node.standing} ${node.ready ? "node-ready" : ""}`}
                  />
                  <text x={11} y={NODE_H / 2 + 4} className="node-label">
                    {truncate(node.name, 26)}
                  </text>
                  {node.misconceptions.length > 0 && (
                    <circle cx={NODE_W - 11} cy={NODE_H / 2} r={4} className="node-flag" />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {selectedNode && (
        <aside className="map-detail">
          <button className="detail-close" onClick={() => setSelected(null)}>
            ×
          </button>
          <span className={`detail-standing standing-${selectedNode.standing}`}>
            {STANDING_LABEL[selectedNode.standing]}
            {selectedNode.ready ? " · ready to learn" : ""}
          </span>
          <h2>{selectedNode.name}</h2>
          <p className="detail-desc">{selectedNode.description}</p>

          {selectedNode.misconceptions.length > 0 && (
            <div className="detail-misconceptions">
              <h3>Recorded misconception</h3>
              {selectedNode.misconceptions.map((m, i) => (
                <p key={i}>{m}</p>
              ))}
            </div>
          )}

          <h3>Taught in</h3>
          <ul className="detail-sites">
            {selectedNode.sites.map((site) => (
              <li key={`${site.chapter}-${site.sectionId}`}>
                <Link
                  href={`/read/${map.course}/${site.chapter}${
                    site.sectionId ? `#${site.sectionId}` : ""
                  }`}
                >
                  Chapter {site.chapterNumber}: {site.chapterTitle} →
                </Link>
              </li>
            ))}
          </ul>

          {incoming.length > 0 && (
            <>
              <h3>Rests on</h3>
              <ul className="detail-edges">
                {incoming.map((e, i) => (
                  <li key={i}>
                    <button onClick={() => setSelected(e.source)}>
                      {byId.get(e.source)?.name}
                    </button>
                    <span className="detail-edge-type">{EDGE_LABEL[e.type]}</span>
                    <span className="detail-evidence">{e.evidence}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {outgoing.length > 0 && (
            <>
              <h3>Leads to</h3>
              <ul className="detail-edges">
                {outgoing.map((e, i) => (
                  <li key={i}>
                    <button onClick={() => setSelected(e.target)}>
                      {byId.get(e.target)?.name}
                    </button>
                    <span className="detail-edge-type">{EDGE_LABEL[e.type]}</span>
                    <span className="detail-evidence">{e.evidence}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
