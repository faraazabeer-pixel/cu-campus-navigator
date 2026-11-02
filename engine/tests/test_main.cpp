// Self-contained test runner (no external framework). Usage: engine_tests [campus.json]
#include <cmath>
#include <cstdio>
#include <functional>
#include <limits>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#include "campus/directions.hpp"
#include "campus/graph.hpp"
#include "campus/minijson.hpp"
#include "campus/protocol.hpp"
#include "campus/router.hpp"

using namespace campus;

static int g_fail = 0, g_checks = 0;
#define CHECK(cond) do { ++g_checks; if (!(cond)) { ++g_fail; std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_NEAR(a, b, eps) do { ++g_checks; double _a = (a), _b = (b); if (!(std::fabs(_a - _b) <= (eps))) { ++g_fail; std::printf("  FAIL %s:%d  %s=%.6f vs %s=%.6f\n", __FILE__, __LINE__, #a, _a, #b, _b); } } while (0)
static void run(const char* name, const std::function<void()>& fn) {
  int before = g_fail; fn();
  std::printf("%s %s\n", g_fail == before ? "[ ok ]" : "[FAIL]", name);
}

struct TNode { double x, z; int level; };
struct TEdge { int a, b; std::string kind, name, crosses; double len; };

static Graph makeGraph(const std::vector<TNode>& ns, const std::vector<TEdge>& es) {
  mj::Value root = mj::Value::object(), gr = mj::Value::object(), nodes = mj::Value::array(), edges = mj::Value::array();
  for (size_t i = 0; i < ns.size(); ++i) {
    mj::Value n = mj::Value::object(); n.set("id", "n" + std::to_string(i)); n.set("x", ns[i].x); n.set("z", ns[i].z); n.set("level", ns[i].level); nodes.push(n);
  }
  for (size_t i = 0; i < es.size(); ++i) {
    mj::Value e = mj::Value::object(); e.set("id", "e" + std::to_string(i));
    e.set("a", "n" + std::to_string(es[i].a)); e.set("b", "n" + std::to_string(es[i].b));
    e.set("len", es[i].len); e.set("kind", es[i].kind.empty() ? "footpath" : es[i].kind); e.set("name", es[i].name); if (!es[i].crosses.empty()) e.set("crosses", es[i].crosses);
    edges.push(e);
  }
  gr.set("nodes", nodes); gr.set("edges", edges); root.set("graph", gr);
  return Graph::fromJson(root);
}
static double eu(const TNode& a, const TNode& b) { return std::hypot(a.x - b.x, a.z - b.z); }
static Anchor N(int n) { Anchor a; a.kind = Anchor::NodeAnchor; a.node = n; return a; }
static Anchor P(double x, double z) { Anchor a; a.kind = Anchor::PointAnchor; a.point = {x, z}; return a; }

// ---------------------------------------------------------------------------------------------
static void testJson() {
  auto v = mj::parse(R"({"a":[1,2.5,-3e2,true,false,null],"s":"h\u00e9llo \ud83d\ude00 \"q\"\n","o":{"k":{}}})");
  CHECK(v["a"].size() == 6); CHECK_NEAR(v["a"].at(2).asNumber(), -300, 1e-9);
  CHECK(v["a"].at(3).asBool()); CHECK(v["a"].at(5).isNull());
  CHECK(v["s"].asString() == "h\xc3\xa9llo \xf0\x9f\x98\x80 \"q\"\n");
  CHECK(v["o"]["k"].isObject()); CHECK(v["missing"]["deeper"].isNull());
  auto again = mj::parse(v.dump());
  CHECK(again.dump() == v.dump());
  for (const char* bad : {"", "{", "[1,]", "{\"a\":}", "tru", "\"abc", "{\"a\" 1}", "[1 2]", "01x", "\"\\ud800\"", "{\"a\":1} x", "[\"\t\"]"}) {
    bool threw = false; try { mj::parse(bad); } catch (const mj::ParseError&) { threw = true; }
    CHECK(threw);
  }
  std::string deep(500, '['); bool threw = false; try { mj::parse(deep); } catch (const mj::ParseError&) { threw = true; } CHECK(threw);
  CHECK(mj::Value(12.5).dump() == "12.5"); CHECK(mj::Value(3.0).dump() == "3"); CHECK(mj::Value(0.1 + 0.2).dump() == "0.3");
}

static void testGraphValidation() {
  auto bad = [](const char* json) { bool t = false; try { Graph::fromJson(mj::parse(json)); } catch (const std::exception&) { t = true; } return t; };
  CHECK(bad(R"({})"));
  CHECK(bad(R"({"graph":{"nodes":[{"id":"a","x":0,"z":0},{"id":"a","x":1,"z":1}],"edges":[]}})"));                       // duplicate id
  CHECK(bad(R"({"graph":{"nodes":[{"id":"a","x":0,"z":0}],"edges":[{"id":"e","a":"a","b":"zz","len":1}]}})"));            // unknown node
  CHECK(bad(R"({"graph":{"nodes":[{"id":"a","x":0,"z":0},{"id":"b","x":1,"z":0}],"edges":[{"id":"e","a":"a","b":"b","len":0}]}})"));   // zero length
  CHECK(bad(R"({"graph":{"nodes":[{"id":"a","x":0,"z":0},{"id":"b","x":1,"z":0}],"edges":[{"id":"e","a":"a","b":"b","len":-5}]}})")); // negative
  CHECK(bad(R"({"graph":{"nodes":[{"id":"a","x":0,"z":0}],"edges":[{"id":"e","a":"a","b":"a","len":5}]}})"));              // self loop
  CHECK(bad(R"({"graph":{"nodes":[{"id":"a","z":0}],"edges":[]}})"));                                                   // missing x
  CHECK(!bad(R"({"graph":{"nodes":[{"id":"a","x":0,"z":0},{"id":"b","x":1,"z":0}],"edges":[{"id":"e","a":"a","b":"b","len":1}]}})"));
}

// Random connected-ish graphs vs. Floyd-Warshall --------------------------------------------------
static void testDijkstraVsFloydWarshall() {
  std::mt19937 rng(12345);
  const double INF = std::numeric_limits<double>::infinity();
  int mismatches = 0, reachable = 0, unreachable = 0;
  for (int trial = 0; trial < 400; ++trial) {
    int n = 2 + rng() % 40;
    std::vector<TNode> ns(n); for (auto& t : ns) t = {double(rng() % 1000), double(rng() % 1000), 0};
    std::vector<TEdge> es; int m = rng() % (3 * n);
    for (int i = 0; i < m; ++i) {
      int a = rng() % n, b = rng() % n; if (a == b) continue;
      double L = eu(ns[a], ns[b]) * (1.0 + (rng() % 50) / 100.0) + 0.5;   // longer than straight line, strictly positive
      es.push_back({a, b, (rng() % 5 == 0) ? "stairs" : "footpath", "", "", L});
    }
    Graph g = makeGraph(ns, es); Router r(g);
    for (Profile prof : {Profile::Walk, Profile::Accessible}) {
      std::vector<std::vector<double>> d(n, std::vector<double>(n, INF));
      for (int i = 0; i < n; ++i) d[i][i] = 0;
      for (auto& e : es) { if (prof == Profile::Accessible && e.kind == "stairs") continue; d[e.a][e.b] = std::min(d[e.a][e.b], e.len); d[e.b][e.a] = std::min(d[e.b][e.a], e.len); }
      for (int k = 0; k < n; ++k) for (int i = 0; i < n; ++i) for (int j = 0; j < n; ++j) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
      for (int q = 0; q < 12; ++q) {
        int s = rng() % n, t = rng() % n;
        auto res = r.route({N(s)}, {N(t)}, prof);
        if (std::isinf(d[s][t])) { ++unreachable; if (res.found) ++mismatches; continue; }
        ++reachable;
        if (!res.found || std::fabs(res.distance - d[s][t]) > 1e-6) ++mismatches;
        if (res.found) {   // path must be contiguous and sum to the distance
          double sum = 0; int cur = s; bool contiguous = true;
          for (auto& h : res.hops) { if (h.fromNode != cur) contiguous = false; cur = h.toNode; sum += h.len; if (prof == Profile::Accessible && g.edges[h.edge].kind == EdgeKind::Stairs) contiguous = false; }
          if (!contiguous || cur != t || std::fabs(sum - res.distance) > 1e-6) ++mismatches;
        }
      }
      // multi-source / multi-target = best over all pairs
      std::vector<Anchor> S, T; std::vector<int> si, ti;
      for (int k = 0; k < 1 + (int)(rng() % 3); ++k) { si.push_back(rng() % n); S.push_back(N(si.back())); }
      for (int k = 0; k < 1 + (int)(rng() % 3); ++k) { ti.push_back(rng() % n); T.push_back(N(ti.back())); }
      double best = INF; for (int a : si) for (int b : ti) best = std::min(best, d[a][b]);
      auto res = r.route(S, T, prof);
      if (std::isinf(best)) { if (res.found) ++mismatches; } else if (!res.found || std::fabs(res.distance - best) > 1e-6) ++mismatches;
    }
  }
  CHECK(mismatches == 0); CHECK(reachable > 1000); CHECK(unreachable > 50);
  std::printf("       (%d reachable / %d unreachable random queries, %d mismatches)\n", reachable, unreachable, mismatches);
}

static void testSnappingAndVirtualNodes() {
  // A(0,0) --100m-- B(100,0) --100m-- C(100,-100)
  Graph g = makeGraph({{0, 0, 0}, {100, 0, 0}, {100, -100, 0}}, {{0, 1, "", "Lane", "", 100}, {1, 2, "", "Lane", "", 100}});
  Router r(g);
  auto same = r.route({P(30, 5)}, {P(70, -5)});                      // both snap onto A-B
  CHECK(same.found); CHECK_NEAR(same.distance, 40, 1e-9); CHECK_NEAR(same.snapFromDist, 5, 1e-9); CHECK_NEAR(same.snapToDist, 5, 1e-9);
  CHECK(same.nodePath.empty());
  auto toB = r.route({P(30, 5)}, {N(1)}); CHECK_NEAR(toB.distance, 70, 1e-9);
  auto across = r.route({P(30, 5)}, {P(105, -60)});                // A-B then B-C
  CHECK_NEAR(across.distance, 70 + 60, 1e-9);
  CHECK_NEAR(across.snappedTo.x, 100, 1e-9); CHECK_NEAR(across.snappedTo.z, -60, 1e-9);
  auto toSelf = r.route({N(2)}, {N(2)}); CHECK(toSelf.found); CHECK_NEAR(toSelf.distance, 0, 1e-12);
  auto clamp = r.route({P(-500, 0)}, {N(1)}); CHECK_NEAR(clamp.distance, 100, 1e-9); CHECK_NEAR(clamp.snapFromDist, 500, 1e-9);  // snaps to node A end
  bool threw = false; try { r.route({}, {N(0)}); } catch (const std::invalid_argument&) { threw = true; } CHECK(threw);
  threw = false; try { r.route({N(99)}, {N(0)}); } catch (const std::invalid_argument&) { threw = true; } CHECK(threw);
}

static void testProfilesAndDisconnected() {
  // two routes: short via stairs (50), long step-free (200); plus island node
  Graph g = makeGraph({{0, 0, 0}, {50, 0, 1}, {100, 0, 0}, {0, 100, 0}, {500, 500, 0}},
    {{0, 1, "stairs", "S", "", 50}, {1, 2, "footpath", "S", "", 50}, {0, 3, "ramp", "R", "", 100}, {3, 2, "ramp", "R", "", 100}});
  Router r(g);
  auto walk = r.route({N(0)}, {N(2)}, Profile::Walk); CHECK_NEAR(walk.distance, 100, 1e-9);
  auto acc = r.route({N(0)}, {N(2)}, Profile::Accessible); CHECK_NEAR(acc.distance, 200, 1e-9);
  CHECK(r.duration(walk) > 0);
  auto none = r.route({N(0)}, {N(4)}); CHECK(!none.found);
  auto accIsland = r.route({N(0)}, {N(1)}, Profile::Accessible);   // node 1 only reachable via stairs or 0-3-2-1 (footpath 2-1) -> reachable at 250
  CHECK(accIsland.found); CHECK_NEAR(accIsland.distance, 250, 1e-9);
}

static void testAlgorithmEdgeCasesAndTrace() {
  // 1. Direct vs alternative routes:
  Graph g1 = makeGraph({{0, 0, 0}, {100, 0, 0}, {50, 50, 0}, {50, -50, 0}},
    {{0, 1, "footpath", "Direct", "", 100},
     {0, 2, "footpath", "LongA", "", 60}, {2, 1, "footpath", "LongB", "", 60},
     {0, 3, "footpath", "ShortA", "", 40}, {3, 1, "footpath", "ShortB", "", 40}});
  Router r1(g1);
  auto res1 = r1.route({N(0)}, {N(1)});
  CHECK(res1.found);
  CHECK_NEAR(res1.distance, 80, 1e-9);
  CHECK(res1.nodePath.size() == 3);
  CHECK(res1.nodePath[0] == 0 && res1.nodePath[1] == 3 && res1.nodePath[2] == 1);

  // 2. Equal-cost paths: deterministic tie breaking
  Graph g2 = makeGraph({{0, 0, 0}, {50, -20, 0}, {50, 20, 0}, {100, 0, 0}},
    {{0, 1, "footpath", "PathA1", "", 50}, {1, 3, "footpath", "PathA2", "", 50},
     {0, 2, "footpath", "PathB1", "", 50}, {2, 3, "footpath", "PathB2", "", 50}});
  Router r2(g2);
  auto eqRes = r2.route({N(0)}, {N(3)});
  CHECK(eqRes.found);
  CHECK_NEAR(eqRes.distance, 100, 1e-9);
  CHECK(eqRes.nodePath.size() == 3);
  CHECK(eqRes.nodePath[1] == 1); // deterministic tie break chooses node 1 over node 2

  // 3. Source equals destination
  auto selfRes = r2.route({N(1)}, {N(1)});
  CHECK(selfRes.found);
  CHECK_NEAR(selfRes.distance, 0, 1e-9);
  CHECK_NEAR(selfRes.cost, 0, 1e-9);
  CHECK(selfRes.hops.empty());

  // 4. Disconnected nodes
  Graph gDisc = makeGraph({{0, 0, 0}, {10, 0, 0}, {100, 100, 0}},
    {{0, 1, "footpath", "Conn", "", 10}});
  Router rDisc(gDisc);
  auto discRes = rDisc.route({N(0)}, {N(2)});
  CHECK(!discRes.found);
  CHECK_NEAR(discRes.distance, 0, 1e-9);

  // 5. Dijkstra trace recording
  auto traceRes = r1.route({N(0)}, {N(1)}, Profile::Walk, true);
  CHECK(traceRes.found);
  CHECK(!traceRes.trace.empty());
  CHECK(traceRes.trace.front().type == TraceEventType::Init);
  CHECK(traceRes.trace.back().type == TraceEventType::Done);
  bool sawRelax = false, sawSettle = false, sawGoal = false;
  for (const auto& step : traceRes.trace) {
    if (step.type == TraceEventType::Relax) sawRelax = true;
    if (step.type == TraceEventType::Settle) sawSettle = true;
    if (step.type == TraceEventType::ReachGoal) sawGoal = true;
  }
  CHECK(sawRelax && sawSettle && sawGoal);
}

static void testDirections() {
  // north = -z. A(0,0) -> B(0,-50) north, then east to C(50,-50) = right turn; west to D(-50,-50) = left turn
  Graph g = makeGraph({{0, 0, 0}, {0, -50, 0}, {50, -50, 0}, {-50, -50, 0}, {100, -50, 0}, {50, 0, 0}},
    {{0, 1, "", "North Path", "", 50}, {1, 2, "", "East Path", "", 50}, {1, 3, "", "West Path", "", 50}, {2, 4, "crossing", "East Path", "Main Road", 50}, {2, 5, "", "South Path", "", 50}});
  Router r(g);
  auto right = r.route({N(0)}, {N(2)}); auto s1 = buildDirections(g, r, right, "Start", "Goal");
  CHECK(s1.size() == 3); CHECK(s1[0].maneuver == "depart"); CHECK(s1[0].instruction.find("head north on North Path") != std::string::npos);
  CHECK(s1[1].maneuver == "right"); CHECK(s1[1].instruction.find("Turn right onto East Path") != std::string::npos);
  CHECK(s1[2].maneuver == "arrive"); CHECK(s1[2].instruction == "Arrive at Goal");
  CHECK_NEAR(s1[0].distance + s1[1].distance, 100, 1e-9); CHECK_NEAR(s1[0].bearing, 0, 1e-9); CHECK_NEAR(s1[1].bearing, 90, 1e-9);
  auto left = r.route({N(0)}, {N(3)}); auto s2 = buildDirections(g, r, left, "", "");
  CHECK(s2[1].maneuver == "left");
  auto cross = r.route({N(0)}, {N(4)}); auto s3 = buildDirections(g, r, cross, "", "");
  bool hasCross = false; for (auto& s : s3) if (s.maneuver == "cross" && s.instruction.find("Cross Main Road") != std::string::npos) hasCross = true;
  CHECK(hasCross);
  auto sharp = r.route({N(3)}, {N(5)});   // west->east->south: turn right (90) at 1? path 3-1-2-5
  CHECK(sharp.found);
  auto geom = routeGeometry(right); CHECK(geom.size() == 3); CHECK_NEAR(geom[2].x, 50, 1e-9);
  CHECK(std::string(compass8(0)) == "north"); CHECK(std::string(compass8(225)) == "southwest"); CHECK(std::string(compass8(359)) == "north");
  CHECK_NEAR(bearingDeg({0, 0}, {10, 0}), 90, 1e-9); CHECK_NEAR(bearingDeg({0, 0}, {0, 10}), 180, 1e-9);
  auto zero = r.route({N(0)}, {N(0)}); auto s4 = buildDirections(g, r, zero, "", "Home"); CHECK(s4.size() == 1 && s4[0].maneuver == "arrive");
}

static void testProtocol(const std::string& campus) {
  Engine e(campus);
  auto ok = mj::parse(e.handleLine(R"({"id":7,"op":"route","from":"gate-1","to":"d6-library"})"));
  CHECK(ok["ok"].asBool()); CHECK(ok["found"].asBool()); CHECK_NEAR(ok["id"].asNumber(), 7, 0); CHECK(ok["distance"].asNumber() > 100);
  CHECK(ok["steps"].size() >= 2); CHECK(ok["geometry"].size() >= 2);
  CHECK(mj::parse(e.handleLine("not json"))["error"]["code"].asString() == "BAD_REQUEST");
  CHECK(mj::parse(e.handleLine(R"({"op":"route","from":"nope","to":"gate-1"})"))["error"]["code"].asString() == "UNKNOWN_ENDPOINT");
  CHECK(mj::parse(e.handleLine(R"({"op":"route","from":{"place":"nope"},"to":"gate-1"})"))["error"]["code"].asString() == "UNKNOWN_PLACE");
  CHECK(mj::parse(e.handleLine(R"({"op":"route","from":"1,2","to":"gate-1","profile":"bike"})"))["error"]["code"].asString() == "BAD_PROFILE");
  CHECK(mj::parse(e.handleLine(R"({"op":"route","from":"abc,def","to":"gate-1"})"))["error"]["code"].asString() == "BAD_ENDPOINT");
  CHECK(mj::parse(e.handleLine(R"({"op":"fly"})"))["error"]["code"].asString() == "UNKNOWN_OP");
  CHECK(mj::parse(e.handleLine(R"([1,2])"))["error"]["code"].asString() == "BAD_REQUEST");
  CHECK(mj::parse(e.handleLine(R"({"op":"ping"})"))["pong"].asBool());
  auto pt = mj::parse(e.handleLine(R"({"op":"route","from":{"x":-40,"z":200},"to":{"place":"food-republic"}})"));
  CHECK(pt["found"].asBool()); CHECK(pt["from"]["kind"].asString() == "point");
  auto sn = mj::parse(e.handleLine(R"({"op":"snap","x":-40,"z":200})")); CHECK(sn["ok"].asBool()); CHECK(sn["distance"].asNumber() < 12);
  bool threw = false; try { Engine bad("/nonexistent/campus.json"); } catch (const std::exception&) { threw = true; } CHECK(threw);
}

static void testRealCampus(const std::string& campus) {
  Graph g = Graph::fromFile(campus); Router r(g);
  const int P_ = (int)g.places.size();
  CHECK(P_ >= 30);
  double worstAsym = 0, maxDist = 0, totalMicros = 0; long q = 0; int bad = 0;
  std::mt19937 rng(7);
  for (int i = 0; i < P_; ++i) for (int j = 0; j < P_; ++j) {
    std::vector<Anchor> A, B; for (int n : g.places[i].entrances) A.push_back(N(n)); for (int n : g.places[j].entrances) B.push_back(N(n));
    auto ab = r.route(A, B); auto ba = r.route(B, A);
    if (!ab.found || !ba.found) { ++bad; continue; }
    worstAsym = std::max(worstAsym, std::fabs(ab.distance - ba.distance)); maxDist = std::max(maxDist, ab.distance);
    totalMicros += ab.stats.micros; ++q;
    // lower bound: straight line between closest entrances
    double lb = 1e18; for (int a : g.places[i].entrances) for (int b : g.places[j].entrances) lb = std::min(lb, std::hypot(g.nodes[a].p.x - g.nodes[b].p.x, g.nodes[a].p.z - g.nodes[b].p.z));
    if (ab.distance + 1e-6 < lb) ++bad;
    double sum = 0; for (auto& h : ab.hops) sum += h.len; if (std::fabs(sum - ab.distance) > 1e-6) ++bad;
    if (i == j && ab.distance != 0) ++bad;
  }
  CHECK(bad == 0); CHECK(worstAsym < 1e-6);
  std::printf("       (%ld place pairs, longest route %.0f m, mean query %.1f us)\n", q, maxDist, totalMicros / std::max(1L, q));
  // triangle inequality on random triples
  int tri = 0;
  for (int k = 0; k < 500; ++k) {
    int a = rng() % P_, b = rng() % P_, c = rng() % P_;
    auto D = [&](int x, int y) { std::vector<Anchor> A, B; for (int n : g.places[x].entrances) A.push_back(N(n)); for (int n : g.places[y].entrances) B.push_back(N(n)); return r.route(A, B).distance; };
    // route via entrance of b may need to pass *through* a specific entrance, so only test with single-entrance semantics: d(a,c) <= d(a,b)+d(b,c) fails only by b's entrance switch; allow that detour via nodes instead.
    int nb = g.places[b].entrances[0];
    auto d1 = r.route({N(g.places[a].entrances[0])}, {N(nb)}).distance, d2 = r.route({N(nb)}, {N(g.places[c].entrances[0])}).distance, d3 = r.route({N(g.places[a].entrances[0])}, {N(g.places[c].entrances[0])}).distance;
    if (d3 > d1 + d2 + 1e-6) ++tri;
    (void)D;
  }
  CHECK(tri == 0);
  // directions on every route: step distances sum to the route distance, geometry indices valid
  int dbad = 0;
  for (int i = 0; i < P_; i += 3) for (int j = 1; j < P_; j += 4) {
    std::vector<Anchor> A, B; for (int n : g.places[i].entrances) A.push_back(N(n)); for (int n : g.places[j].entrances) B.push_back(N(n));
    auto rr = r.route(A, B); if (!rr.found) { ++dbad; continue; }
    auto steps = buildDirections(g, r, rr, g.places[i].name, g.places[j].name); auto geom = routeGeometry(rr);
    double s = 0; for (auto& st : steps) { s += st.distance; if (st.geomEnd >= geom.size() + 1 || st.instruction.empty()) ++dbad; }
    if (std::fabs(s - rr.distance) > 1e-6) ++dbad;
    if (steps.empty() || steps.back().maneuver != "arrive") ++dbad;
    if (!rr.hops.empty() && (std::fabs(geom.front().x - rr.snappedFrom.x) > 1e-9 || std::fabs(geom.back().z - rr.snappedTo.z) > 1e-9)) ++dbad;
  }
  CHECK(dbad == 0);
  // accessible profile on a stair-free campus equals walk
  auto w = r.route({N(g.places[0].entrances[0])}, {N(g.places[5].entrances[0])}, Profile::Walk), a = r.route({N(g.places[0].entrances[0])}, {N(g.places[5].entrances[0])}, Profile::Accessible);
  CHECK_NEAR(w.distance, a.distance, 1e-9);
}

int main(int argc, char** argv) {
  const std::string campus = argc > 1 ? argv[1] : "data/campus.json";
  run("json parser / writer", testJson);
  run("graph validation rejects bad data", testGraphValidation);
  run("Dijkstra == Floyd-Warshall on 400 random graphs (walk+accessible, multi-source)", testDijkstraVsFloydWarshall);
  run("edge snapping & virtual nodes", testSnappingAndVirtualNodes);
  run("profiles, step-free routing, disconnected graph", testProfilesAndDisconnected);
  run("algorithm edge cases & Dijkstra trace", testAlgorithmEdgeCasesAndTrace);
  run("turn-by-turn directions", testDirections);
  run("JSON protocol & error handling", [&] { testProtocol(campus); });
  run("real campus dataset: all place pairs", [&] { testRealCampus(campus); });
  std::printf("\n%d checks, %d failed\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
