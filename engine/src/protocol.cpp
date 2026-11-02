#include "campus/protocol.hpp"

#include <cmath>
#include <cstdlib>
#include <sstream>

namespace campus {

using mj::Value;

Value errorResponse(const std::string& code, const std::string& message, const Value* id) {
  Value r = Value::object();
  if (id && !id->isNull()) r.set("id", *id);
  r.set("ok", false);
  Value e = Value::object(); e.set("code", code); e.set("message", message);
  r.set("error", e);
  return r;
}

Engine::Engine(const std::string& campusPath) : path_(campusPath) {
  graph_.reset(new Graph(Graph::fromFile(campusPath)));
  router_.reset(new Router(*graph_));
}

static Value pt(const Point& p) { Value a = Value::array(); a.push(p.x); a.push(p.z); return a; }

bool Engine::resolve(const Value& spec, Resolved* out, std::string* err, std::string* code) const {
  const Graph& g = *graph_;
  auto fail = [&](const char* c, const std::string& m) { *code = c; *err = m; return false; };
  // Shorthand string: place id, node id or "x,z"
  std::string place, node;
  bool hasXZ = false; double x = 0, z = 0;
  if (spec.isString()) {
    const std::string& s = spec.asString();
    size_t comma = s.find(',');
    if (g.placeIndex(s) >= 0) place = s;
    else if (g.nodeIndex(s) >= 0) node = s;
    else if (comma != std::string::npos) {
      char* e1 = nullptr; char* e2 = nullptr;
      x = std::strtod(s.c_str(), &e1); z = std::strtod(s.c_str() + comma + 1, &e2);
      if (e1 != s.c_str() + comma || *e2 != '\0' || !std::isfinite(x) || !std::isfinite(z)) return fail("BAD_ENDPOINT", "cannot parse endpoint \"" + s + "\"");
      hasXZ = true;
    } else return fail("UNKNOWN_ENDPOINT", "unknown place or node \"" + s + "\"");
  } else if (spec.isObject()) {
    place = spec["place"].asString(); node = spec["node"].asString();
    if (spec["x"].isNumber() && spec["z"].isNumber()) { hasXZ = true; x = spec["x"].asNumber(); z = spec["z"].asNumber(); }
    if (place.empty() && node.empty() && !hasXZ) return fail("BAD_ENDPOINT", "endpoint needs one of place, node, or x/z");
    if (hasXZ && (!std::isfinite(x) || !std::isfinite(z))) return fail("BAD_ENDPOINT", "non-finite coordinates");
  } else return fail("BAD_ENDPOINT", "endpoint must be a string or object");

  if (!place.empty()) {
    int pi = g.placeIndex(place);
    if (pi < 0) return fail("UNKNOWN_PLACE", "unknown place \"" + place + "\"");
    const Place& p = g.places[pi];
    if (p.entrances.empty()) return fail("NO_ENTRANCE", "place \"" + place + "\" has no entrance");
    for (int n : p.entrances) { Anchor a; a.kind = Anchor::NodeAnchor; a.node = n; out->anchors.push_back(a); }
    out->label = p.name; out->kind = "place"; out->id = p.id;
  } else if (!node.empty()) {
    int ni = g.nodeIndex(node);
    if (ni < 0) return fail("UNKNOWN_NODE", "unknown node \"" + node + "\"");
    Anchor a; a.kind = Anchor::NodeAnchor; a.node = ni; out->anchors.push_back(a);
    out->label = g.nodes[ni].landmark.empty() ? std::string("Selected point") : "Point near " + g.nodes[ni].landmark;
    out->kind = "node"; out->id = node;
  } else {
    Anchor a; a.kind = Anchor::PointAnchor; a.point = {x, z}; out->anchors.push_back(a);
    out->label = "Selected point"; out->kind = "point";
  }
  return true;
}

Value Engine::info() const {
  const Graph& g = *graph_;
  Value r = Value::object();
  r.set("ok", true);
  r.set("engine", "cu-campus-route-engine"); r.set("version", "1.0.0");
  r.set("algorithm", "Dijkstra (binary heap), multi-source, edge snapping");
  r.set("nodes", (long)g.nodes.size()); r.set("edges", (long)g.edges.size()); r.set("places", (long)g.places.size());
  r.set("profiles", [] { Value a = Value::array(); a.push("walk"); a.push("accessible"); return a; }());
  r.set("data", path_);
  return r;
}

Value Engine::route(const Value& req) {
  Resolved from, to; std::string err, code;
  if (!resolve(req["from"], &from, &err, &code)) return errorResponse(code, "from: " + err, &req["id"]);
  if (!resolve(req["to"], &to, &err, &code)) return errorResponse(code, "to: " + err, &req["id"]);
  bool okp = true;
  Profile prof = parseProfile(req["profile"].asString(), &okp);
  if (!okp) return errorResponse("BAD_PROFILE", "profile must be \"walk\" or \"accessible\"", &req["id"]);
  bool visualize = req["visualize"].asBool(false);

  RouteResult rr;
  try { rr = router_->route(from.anchors, to.anchors, prof, visualize); }
  catch (const std::exception& e) { return errorResponse("ROUTE_FAILED", e.what(), &req["id"]); }

  Value r = Value::object();
  if (!req["id"].isNull()) r.set("id", req["id"]);
  r.set("ok", true);
  r.set("found", rr.found);
  r.set("profile", profileName(prof));
  Value f = Value::object(); f.set("label", from.label); f.set("kind", from.kind); if (!from.id.empty()) f.set("id", from.id);
  Value t = Value::object(); t.set("label", to.label); t.set("kind", to.kind); if (!to.id.empty()) t.set("id", to.id);
  if (!rr.found) {
    r.set("from", f); r.set("to", t);
    r.set("message", "No walking route connects these locations" + std::string(prof == Profile::Accessible ? " using step-free paths." : "."));
    Value st = Value::object(); st.set("expanded", rr.stats.expanded); st.set("micros", std::floor(rr.stats.micros)); r.set("stats", st);
    return r;
  }
  f.set("point", pt(rr.snappedFrom)); t.set("point", pt(rr.snappedTo));
  if (from.kind == "point") f.set("snapDistance", rr.snapFromDist);
  if (to.kind == "point") t.set("snapDistance", rr.snapToDist);
  r.set("from", f); r.set("to", t);
  r.set("distance", rr.distance);
  r.set("duration", router_->duration(rr));
  Value nodes = Value::array();
  for (int n : rr.nodePath) nodes.push(graph_->nodes[n].id);
  r.set("nodes", nodes);
  Value geom = Value::array();
  for (const Point& p : routeGeometry(rr)) geom.push(pt(p));
  r.set("geometry", geom);
  Value steps = Value::array();
  for (const Step& s : buildDirections(*graph_, *router_, rr, from.label, to.label)) {
    Value o = Value::object();
    o.set("maneuver", s.maneuver); o.set("instruction", s.instruction);
    if (!s.name.empty()) o.set("name", s.name);
    if (!s.landmark.empty()) o.set("landmark", s.landmark);
    o.set("distance", s.distance); o.set("duration", s.duration); o.set("bearing", std::floor(s.bearing + 0.5));
    o.set("at", pt(s.at)); o.set("geomStart", (long)s.geomStart); o.set("geomEnd", (long)s.geomEnd);
    steps.push(o);
  }
  r.set("steps", steps);
  Value st = Value::object();
  st.set("expanded", rr.stats.expanded); st.set("relaxed", rr.stats.relaxed); st.set("micros", std::floor(rr.stats.micros));
  r.set("stats", st);

  if (visualize) {
    Value trace = Value::array();
    for (const auto& ts : rr.trace) {
      Value o = Value::object();
      const char* typeStr = "init";
      switch (ts.type) {
        case TraceEventType::Init: typeStr = "init"; break;
        case TraceEventType::Pop: typeStr = "pop"; break;
        case TraceEventType::Skip: typeStr = "skip"; break;
        case TraceEventType::Settle: typeStr = "settle"; break;
        case TraceEventType::Relax: typeStr = "relax"; break;
        case TraceEventType::ReachGoal: typeStr = "reach_goal"; break;
        case TraceEventType::Done: typeStr = "done"; break;
      }
      o.set("type", typeStr);
      if (!ts.nodeId.empty()) o.set("node", ts.nodeId);
      o.set("point", pt(ts.nodePos));
      o.set("currentDist", ts.currentDist);
      if (ts.type == TraceEventType::Relax) {
        if (!ts.neighborId.empty()) o.set("neighbor", ts.neighborId);
        o.set("neighborPoint", pt(ts.neighborPos));
        if (!ts.edgeId.empty()) o.set("edge", ts.edgeId);
        o.set("edgeCost", ts.edgeCost);
        o.set("oldDist", ts.oldDist);
        o.set("newDist", ts.newDist);
        if (!ts.prevNodeId.empty()) o.set("prev", ts.prevNodeId);
      }
      o.set("pqSize", (long)ts.pqSize);
      o.set("minPqDist", ts.minPqDist);
      trace.push(o);
    }
    r.set("trace", trace);
  }
  return r;
}

Value Engine::handle(const Value& req) {
  try {
    if (!req.isObject()) return errorResponse("BAD_REQUEST", "request must be a JSON object");
    const std::string op = req["op"].asString();
    if (op == "ping") { Value r = Value::object(); if (!req["id"].isNull()) r.set("id", req["id"]); r.set("ok", true); r.set("pong", true); return r; }
    if (op == "info") { Value r = info(); if (!req["id"].isNull()) r.set("id", req["id"]); return r; }
    if (op == "route") return route(req);
    if (op == "snap") {
      if (!req["x"].isNumber() || !req["z"].isNumber()) return errorResponse("BAD_REQUEST", "snap needs numeric x and z", &req["id"]);
      bool okp = true; Profile prof = parseProfile(req["profile"].asString(), &okp);
      Point q; int e; double t, d;
      if (!router_->snap({req["x"].asNumber(), req["z"].asNumber()}, prof, &q, &e, &t, &d)) return errorResponse("EMPTY_GRAPH", "no edges", &req["id"]);
      Value r = Value::object(); if (!req["id"].isNull()) r.set("id", req["id"]);
      r.set("ok", true); r.set("point", pt(q)); r.set("edge", graph_->edges[e].id); r.set("distance", d);
      return r;
    }
    if (op == "reload") {
      std::unique_ptr<Graph> ng(new Graph(Graph::fromFile(path_)));
      router_.reset(); graph_ = std::move(ng); router_.reset(new Router(*graph_));
      Value r = info(); if (!req["id"].isNull()) r.set("id", req["id"]); r.set("reloaded", true); return r;
    }
    return errorResponse("UNKNOWN_OP", "unknown op \"" + op + "\"", &req["id"]);
  } catch (const std::exception& e) {
    return errorResponse("INTERNAL", e.what(), &req["id"]);
  }
}

std::string Engine::handleLine(const std::string& line) {
  try { return handle(mj::parse(line)).dump(); }
  catch (const mj::ParseError& e) { return errorResponse("BAD_REQUEST", e.what()).dump(); }
}

}  // namespace campus
