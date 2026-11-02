#include "campus/router.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <functional>
#include <limits>
#include <queue>
#include <stdexcept>
#include <unordered_map>

namespace campus {

Profile parseProfile(const std::string& s, bool* ok) {
  if (ok) *ok = true;
  if (s.empty() || s == "walk") return Profile::Walk;
  if (s == "accessible") return Profile::Accessible;
  if (ok) *ok = false;
  return Profile::Walk;
}
const char* profileName(Profile p) { return p == Profile::Accessible ? "accessible" : "walk"; }

double Router::speed(EdgeKind k) {
  switch (k) {
    case EdgeKind::Stairs: return 0.6;
    case EdgeKind::Crossing: return 1.2;
    case EdgeKind::Elevator: return 0.5;
    default: return 1.35;  // ~4.9 km/h average adult walking speed
  }
}

double Router::edgeCost(const Edge& e, Profile p) {
  if (p == Profile::Accessible && e.kind == EdgeKind::Stairs) return -1;  // step-free routing
  return e.len;  // shortest *distance*
}

namespace {
struct Arc { int to; int edge; double cost; double len; };
constexpr double INF = std::numeric_limits<double>::infinity();

double distp(const Point& a, const Point& b) { return std::hypot(a.x - b.x, a.z - b.z); }
}  // namespace

bool Router::snap(Point p, Profile profile, Point* out, int* edge, double* t, double* dist) const {
  double best = INF; int be = -1; double bt = 0; Point bp;
  for (size_t i = 0; i < g_.edges.size(); ++i) {
    const Edge& e = g_.edges[i];
    if (edgeCost(e, profile) < 0) continue;
    const Point& a = g_.nodes[e.a].p; const Point& b = g_.nodes[e.b].p;
    double dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    double tt = l2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
    tt = std::max(0.0, std::min(1.0, tt));
    Point q{a.x + dx * tt, a.z + dz * tt};
    double d = distp(p, q);
    if (d < best) { best = d; be = static_cast<int>(i); bt = tt; bp = q; }
  }
  if (be < 0) return false;
  if (out) *out = bp;
  if (edge) *edge = be;
  if (t) *t = bt;
  if (dist) *dist = best;
  return true;
}

struct PQItem {
  double dist = 0;
  int u = 0;
  bool operator>(const PQItem& o) const {
    if (std::fabs(dist - o.dist) > 1e-9) return dist > o.dist;
    return u > o.u;  // deterministic tie-breaker by node index
  }
};

RouteResult Router::route(const std::vector<Anchor>& from, const std::vector<Anchor>& to, Profile profile, bool recordTrace) const {
  auto t0 = std::chrono::steady_clock::now();
  if (from.empty() || to.empty()) throw std::invalid_argument("route needs at least one start and one destination anchor");
  const int N = static_cast<int>(g_.nodes.size());

  // ---- virtual nodes for snapped points (indices N, N+1, ...)
  struct Virt { Point p; int edge; double t; double snapDist; };
  std::vector<Virt> virt;
  std::vector<int> fromIdx, toIdx;   // resolved node indices (real or virtual)
  auto resolve = [&](const Anchor& a) -> int {
    if (a.kind == Anchor::NodeAnchor) {
      if (a.node < 0 || a.node >= N) throw std::invalid_argument("anchor references an unknown node");
      return a.node;
    }
    Point q; int e; double t, d;
    if (!snap(a.point, profile, &q, &e, &t, &d)) throw std::invalid_argument("no walkable edges to snap to");
    virt.push_back({q, e, t, d});
    return N + static_cast<int>(virt.size()) - 1;
  };
  for (const auto& a : from) fromIdx.push_back(resolve(a));
  for (const auto& a : to) toIdx.push_back(resolve(a));

  const int V = static_cast<int>(virt.size());
  const int T = N + V;
  std::vector<std::vector<Arc>> vArcs(V);            // arcs leaving virtual nodes
  std::unordered_map<int, std::vector<Arc>> extra;   // arcs from real nodes into virtual nodes
  for (int k = 0; k < V; ++k) {
    const Edge& e = g_.edges[virt[k].edge];
    double c = edgeCost(e, profile);
    double toA = virt[k].t * e.len, toB = (1 - virt[k].t) * e.len;
    vArcs[k].push_back({e.a, virt[k].edge, c * virt[k].t, toA});
    vArcs[k].push_back({e.b, virt[k].edge, c * (1 - virt[k].t), toB});
    extra[e.a].push_back({N + k, virt[k].edge, c * virt[k].t, toA});
    extra[e.b].push_back({N + k, virt[k].edge, c * (1 - virt[k].t), toB});
    for (int j = 0; j < k; ++j) if (virt[j].edge == virt[k].edge) {   // two snapped points on one edge
      double dl = std::fabs(virt[k].t - virt[j].t) * e.len;
      vArcs[k].push_back({N + j, virt[k].edge, c * std::fabs(virt[k].t - virt[j].t), dl});
      vArcs[j].push_back({N + k, virt[k].edge, c * std::fabs(virt[k].t - virt[j].t), dl});
    }
  }

  auto pos = [&](int n) -> Point { return n < N ? g_.nodes[n].p : virt[n - N].p; };
  auto getNodeId = [&](int n) -> std::string {
    if (n < N) return g_.nodes[n].id;
    return "virt-" + std::to_string(n - N);
  };

  std::vector<double> dist(T, INF);
  std::vector<int> prev(T, -1), prevEdge(T, -1);
  std::vector<double> prevLen(T, 0);
  std::vector<char> isGoal(T, 0), done(T, 0);
  for (int g : toIdx) isGoal[g] = 1;

  std::priority_queue<PQItem, std::vector<PQItem>, std::greater<PQItem>> pq;
  std::vector<int> seedOf(T, -1);
  RouteResult res;

  for (size_t i = 0; i < fromIdx.size(); ++i) {
    int s = fromIdx[i];
    if (dist[s] > 0) {
      dist[s] = 0;
      seedOf[s] = static_cast<int>(i);
      pq.push({0.0, s});
      if (recordTrace) {
        TraceStep step;
        step.type = TraceEventType::Init;
        step.node = s;
        step.nodeId = getNodeId(s);
        step.nodePos = pos(s);
        step.currentDist = 0;
        step.pqSize = static_cast<int>(pq.size());
        step.minPqDist = 0;
        res.trace.push_back(std::move(step));
      }
    }
  }

  int reached = -1;
  auto relax = [&](int u, const Arc& a) {
    double nd = dist[u] + a.cost;
    ++res.stats.relaxed;
    if (nd < dist[a.to]) {
      double oldD = dist[a.to];
      dist[a.to] = nd;
      prev[a.to] = u;
      prevEdge[a.to] = a.edge;
      prevLen[a.to] = a.len;
      seedOf[a.to] = seedOf[u];
      pq.push({nd, a.to});
      if (recordTrace) {
        TraceStep step;
        step.type = TraceEventType::Relax;
        step.node = u;
        step.nodeId = getNodeId(u);
        step.nodePos = pos(u);
        step.neighborNode = a.to;
        step.neighborId = getNodeId(a.to);
        step.neighborPos = pos(a.to);
        step.edge = a.edge;
        step.edgeId = a.edge >= 0 ? g_.edges[a.edge].id : "";
        step.currentDist = dist[u];
        step.edgeCost = a.cost;
        step.oldDist = oldD;
        step.newDist = nd;
        step.prevNode = u;
        step.prevNodeId = getNodeId(u);
        step.pqSize = static_cast<int>(pq.size());
        step.minPqDist = pq.top().dist;
        res.trace.push_back(std::move(step));
      }
    }
  };

  while (!pq.empty()) {
    auto [d, u] = pq.top(); pq.pop();
    if (done[u]) {
      if (recordTrace) {
        TraceStep step;
        step.type = TraceEventType::Skip;
        step.node = u;
        step.nodeId = getNodeId(u);
        step.nodePos = pos(u);
        step.currentDist = d;
        step.pqSize = static_cast<int>(pq.size());
        step.minPqDist = pq.empty() ? 0 : pq.top().dist;
        res.trace.push_back(std::move(step));
      }
      continue;
    }
    done[u] = 1; ++res.stats.expanded;
    if (recordTrace) {
      TraceStep step;
      step.type = TraceEventType::Settle;
      step.node = u;
      step.nodeId = getNodeId(u);
      step.nodePos = pos(u);
      step.currentDist = dist[u];
      step.pqSize = static_cast<int>(pq.size());
      step.minPqDist = pq.empty() ? 0 : pq.top().dist;
      res.trace.push_back(std::move(step));
    }
    if (isGoal[u]) {
      reached = u;
      if (recordTrace) {
        TraceStep step;
        step.type = TraceEventType::ReachGoal;
        step.node = u;
        step.nodeId = getNodeId(u);
        step.nodePos = pos(u);
        step.currentDist = dist[u];
        step.pqSize = static_cast<int>(pq.size());
        res.trace.push_back(std::move(step));
      }
      break;   // all weights > 0 => first goal popped is optimal
    }
    if (u < N) {
      for (int ei : g_.adj[u]) {
        const Edge& e = g_.edges[ei];
        double c = edgeCost(e, profile);
        if (c < 0) continue;
        relax(u, {g_.otherEnd(e, u), ei, c, e.len});
      }
      auto it = extra.find(u);
      if (it != extra.end()) for (const Arc& a : it->second) relax(u, a);
    } else {
      for (const Arc& a : vArcs[u - N]) relax(u, a);
    }
  }

  if (reached >= 0) {
    res.found = true;
    res.cost = dist[reached];
    std::vector<int> chain;
    for (int c = reached; c != -1; c = prev[c]) chain.push_back(c);
    std::reverse(chain.begin(), chain.end());
    for (size_t i = 0; i < chain.size(); ++i) {
      int n = chain[i];
      if (n < N) res.nodePath.push_back(n);
      if (i + 1 < chain.size()) {
        int m = chain[i + 1];
        Hop h; h.from = pos(n); h.to = pos(m); h.edge = prevEdge[m]; h.fromNode = n < N ? n : -1; h.toNode = m < N ? m : -1; h.len = prevLen[m];
        res.hops.push_back(h);
        res.distance += h.len;
      }
    }
    int s = chain.front();
    res.snappedFrom = pos(s); res.snappedTo = pos(reached);
    for (size_t i = 0; i < fromIdx.size(); ++i) if (fromIdx[i] == s) { res.sourceAnchor = static_cast<int>(i); break; }
    for (size_t i = 0; i < toIdx.size(); ++i) if (toIdx[i] == reached) { res.targetAnchor = static_cast<int>(i); break; }
    if (s >= N) res.snapFromDist = virt[s - N].snapDist;
    if (reached >= N) res.snapToDist = virt[reached - N].snapDist;
  }

  if (recordTrace) {
    TraceStep step;
    step.type = TraceEventType::Done;
    step.node = reached;
    step.nodeId = reached >= 0 ? getNodeId(reached) : "";
    step.currentDist = reached >= 0 ? dist[reached] : 0;
    res.trace.push_back(std::move(step));
  }

  res.stats.micros = std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - t0).count();
  return res;
}

double Router::duration(const RouteResult& r) const {
  double s = 0;
  for (const Hop& h : r.hops) s += h.len / speed(g_.edges[h.edge].kind);
  return s;
}

}  // namespace campus
