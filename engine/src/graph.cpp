#include "campus/graph.hpp"

#include <cmath>
#include <fstream>
#include <sstream>
#include <stdexcept>

namespace campus {

EdgeKind parseKind(const std::string& s) {
  if (s == "sidewalk") return EdgeKind::Sidewalk;
  if (s == "plaza") return EdgeKind::Plaza;
  if (s == "crossing") return EdgeKind::Crossing;
  if (s == "entrance") return EdgeKind::Entrance;
  if (s == "stairs") return EdgeKind::Stairs;
  if (s == "ramp") return EdgeKind::Ramp;
  if (s == "elevator") return EdgeKind::Elevator;
  if (s == "indoor") return EdgeKind::Indoor;
  return EdgeKind::Footpath;
}

const char* kindName(EdgeKind k) {
  switch (k) {
    case EdgeKind::Sidewalk: return "sidewalk";
    case EdgeKind::Plaza: return "plaza";
    case EdgeKind::Crossing: return "crossing";
    case EdgeKind::Entrance: return "entrance";
    case EdgeKind::Stairs: return "stairs";
    case EdgeKind::Ramp: return "ramp";
    case EdgeKind::Elevator: return "elevator";
    case EdgeKind::Indoor: return "indoor";
    default: return "footpath";
  }
}

int Graph::nodeIndex(const std::string& id) const { auto it = nodeIdx_.find(id); return it == nodeIdx_.end() ? -1 : it->second; }
int Graph::placeIndex(const std::string& id) const { auto it = placeIdx_.find(id); return it == placeIdx_.end() ? -1 : it->second; }

Graph Graph::fromJson(const mj::Value& root) {
  Graph g;
  const mj::Value& gr = root["graph"];
  if (!gr.isObject()) throw std::runtime_error("campus data: missing \"graph\" object");
  if (!gr["nodes"].isArray() || !gr["edges"].isArray()) throw std::runtime_error("campus data: graph.nodes / graph.edges must be arrays");

  for (const auto& n : gr["nodes"].items()) {
    Node node;
    node.id = n["id"].asString();
    if (node.id.empty()) throw std::runtime_error("campus data: node without id");
    if (!n["x"].isNumber() || !n["z"].isNumber() || !std::isfinite(n["x"].asNumber()) || !std::isfinite(n["z"].asNumber()))
      throw std::runtime_error("campus data: node " + node.id + " has invalid coordinates");
    if (g.nodeIdx_.count(node.id)) throw std::runtime_error("campus data: duplicate node id " + node.id);
    node.p = {n["x"].asNumber(), n["z"].asNumber()};
    node.level = static_cast<int>(n["level"].asNumber(0));
    node.kind = n["kind"].asString();
    node.landmark = n["landmark"].asString();
    g.nodeIdx_[node.id] = static_cast<int>(g.nodes.size());
    g.nodes.push_back(std::move(node));
  }
  g.adj.assign(g.nodes.size(), {});
  for (const auto& e : gr["edges"].items()) {
    Edge edge;
    edge.id = e["id"].asString();
    int a = g.nodeIndex(e["a"].asString()), b = g.nodeIndex(e["b"].asString());
    if (a < 0 || b < 0) throw std::runtime_error("campus data: edge " + edge.id + " references an unknown node");
    if (a == b) throw std::runtime_error("campus data: edge " + edge.id + " is a self-loop");
    edge.a = a; edge.b = b;
    edge.len = e["len"].asNumber(-1);
    if (e["len"].isNull() || !(edge.len > 0) || !std::isfinite(edge.len))
      throw std::runtime_error("campus data: edge " + edge.id + " must have a positive finite length");
    edge.kind = parseKind(e["kind"].asString());
    edge.name = e["name"].asString();
    edge.crosses = e["crosses"].asString();
    g.adj[a].push_back(static_cast<int>(g.edges.size()));
    g.adj[b].push_back(static_cast<int>(g.edges.size()));
    g.edges.push_back(std::move(edge));
  }
  if (root["places"].isArray()) {
    for (const auto& p : root["places"].items()) {
      Place pl;
      pl.id = p["id"].asString();
      pl.name = p["name"].asString();
      pl.category = p["kind"].asString();
      if (p["centroid"].isArray() && p["centroid"].size() == 2) pl.centroid = {p["centroid"].at(0).asNumber(), p["centroid"].at(1).asNumber()};
      for (const auto& en : p["entrances"].items()) {
        int ni = g.nodeIndex(en.asString());
        if (ni < 0) throw std::runtime_error("campus data: place " + pl.id + " has unknown entrance " + en.asString());
        pl.entrances.push_back(ni);
      }
      if (pl.id.empty()) throw std::runtime_error("campus data: place without id");
      if (g.placeIdx_.count(pl.id)) throw std::runtime_error("campus data: duplicate place id " + pl.id);
      g.placeIdx_[pl.id] = static_cast<int>(g.places.size());
      g.places.push_back(std::move(pl));
    }
  }
  return g;
}

Graph Graph::fromFile(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) throw std::runtime_error("cannot open campus data file: " + path);
  std::stringstream ss; ss << f.rdbuf();
  try { return fromJson(mj::parse(ss.str())); }
  catch (const mj::ParseError& e) { throw std::runtime_error(std::string("invalid campus JSON: ") + e.what()); }
}

}  // namespace campus
