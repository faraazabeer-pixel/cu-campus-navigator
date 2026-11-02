#include "campus/directions.hpp"

#include <cctype>
#include <cmath>

namespace campus {

namespace {
constexpr double kPi = 3.14159265358979323846;
double wrap180(double a) { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; }

enum class Cat { Walk, Cross, Stairs };
Cat catOf(EdgeKind k) {
  if (k == EdgeKind::Crossing) return Cat::Cross;
  if (k == EdgeKind::Stairs) return Cat::Stairs;
  return Cat::Walk;
}

const char* turnManeuver(double t) {  // t > 0 : right (clockwise)
  double a = std::fabs(t);
  if (a < 25) return "straight";
  if (a < 60) return t > 0 ? "slight-right" : "slight-left";
  if (a < 135) return t > 0 ? "right" : "left";
  return t > 0 ? "sharp-right" : "sharp-left";
}
}  // namespace

double bearingDeg(const Point& a, const Point& b) {
  double d = std::atan2(b.x - a.x, -(b.z - a.z)) * 180.0 / kPi;
  if (d < 0) d += 360;
  return d;
}

const char* compass8(double b) {
  static const char* n[] = {"north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"};
  return n[static_cast<int>(std::floor((b + 22.5) / 45.0)) % 8];
}

std::vector<Point> routeGeometry(const RouteResult& r) {
  std::vector<Point> g;
  for (const Hop& h : r.hops) {
    if (h.len <= 1e-6) continue;  // keep in lock-step with buildDirections()
    if (g.empty()) g.push_back(h.from);
    g.push_back(h.to);
  }
  if (g.empty() && r.found) g.push_back(r.snappedFrom);
  return g;
}

std::vector<Step> buildDirections(const Graph& g, const Router&, const RouteResult& route, const std::string& fromLabel, const std::string& toLabel) {
  std::vector<Step> steps;
  if (!route.found) return steps;
  // 1. drop degenerate hops
  std::vector<const Hop*> hops;
  for (const Hop& h : route.hops) if (h.len > 1e-6) hops.push_back(&h);

  if (hops.empty()) {
    Step a; a.maneuver = "arrive"; a.instruction = "You are already at " + (toLabel.empty() ? std::string("your destination") : toLabel);
    a.at = route.snappedTo; steps.push_back(a); return steps;
  }

  auto landmarkAt = [&](const Hop& h) -> std::string { return h.fromNode >= 0 ? g.nodes[h.fromNode].landmark : std::string(); };

  // 2. group hops into legs
  struct Leg { size_t first, last; double dist; double dur; Cat cat; std::string name; std::string crosses; double bearing; double turnIn; };
  std::vector<Leg> legs;
  double prevBearing = 0;
  for (size_t i = 0; i < hops.size(); ++i) {
    const Hop& h = *hops[i];
    const Edge& e = g.edges[h.edge];
    double b = bearingDeg(h.from, h.to);
    Cat c = catOf(e.kind);
    bool newLeg = legs.empty();
    double turn = 0;
    if (!legs.empty()) {
      turn = wrap180(b - prevBearing);
      const Leg& L = legs.back();
      const bool nameChange = !e.name.empty() && !L.name.empty() && e.name != L.name && e.kind != EdgeKind::Entrance;
      if (c != L.cat || std::fabs(turn) >= 25 || nameChange || c != Cat::Walk) newLeg = true;
    }
    if (newLeg) legs.push_back({i, i, 0, 0, c, e.name, e.crosses, b, turn});
    Leg& L = legs.back();
    L.last = i; L.dist += h.len; L.dur += h.len / Router::speed(e.kind);
    prevBearing = b;
  }

  // 3. words
  double lastTurn = 0;
  for (size_t li = 0; li < legs.size(); ++li) {
    const Leg& L = legs[li];
    const Hop& h0 = *hops[L.first];
    Step s;
    s.name = L.name; s.distance = L.dist; s.duration = L.dur; s.bearing = L.bearing; s.at = h0.from;
    s.landmark = landmarkAt(h0);
    if (s.landmark == fromLabel || s.landmark == toLabel) s.landmark.clear();
    bool isEntrance = g.edges[h0.edge].kind == EdgeKind::Entrance;
    std::string on = (L.name.empty() || isEntrance) ? std::string() : L.name;
    std::string near = s.landmark.empty() ? std::string() : (" near " + s.landmark);

    if (L.cat == Cat::Cross) {
      s.maneuver = "cross";
      s.instruction = "Cross " + (L.crosses.empty() ? std::string("the road") : L.crosses) + near;
    } else if (L.cat == Cat::Stairs) {
      double dl = 0;
      if (h0.fromNode >= 0 && h0.toNode >= 0) {
        dl = g.nodes[h0.toNode].level - g.nodes[h0.fromNode].level;
      } else if (h0.toNode >= 0) {
        dl = g.nodes[h0.toNode].level;
      } else if (h0.fromNode >= 0) {
        dl = -g.nodes[h0.fromNode].level;
      }
      s.maneuver = "stairs";
      s.instruction = std::string("Take the stairs ") + (dl < 0 ? "down" : "up") + near;
    } else if (li == 0) {
      s.maneuver = "depart";
      s.instruction = std::string("Head ") + compass8(L.bearing) + (on.empty() ? "" : " on " + on);
      if (!fromLabel.empty()) s.instruction = "From " + fromLabel + ", " + static_cast<char>(std::tolower(static_cast<unsigned char>(s.instruction[0]))) + s.instruction.substr(1);
    } else {
      s.maneuver = turnManeuver(L.turnIn);
      if (s.maneuver == "straight") {
        s.instruction = on.empty() ? std::string("Continue straight") : "Continue straight onto " + on;
      } else {
        std::string verb = s.maneuver == "left" ? "Turn left" : s.maneuver == "right" ? "Turn right"
          : s.maneuver == "slight-left" ? "Bear slightly left" : s.maneuver == "slight-right" ? "Bear slightly right"
          : s.maneuver == "sharp-left" ? "Make a sharp left" : "Make a sharp right";
        s.instruction = verb + (on.empty() ? "" : " onto " + on);
      }
      s.instruction += near;
    }
    lastTurn = L.turnIn;
    const bool lastLeg = li + 1 == legs.size();
    if (isEntrance && lastLeg && !toLabel.empty() && s.maneuver != "depart" && s.maneuver != "cross" && s.maneuver != "stairs") {
      // final approach along an entrance spur: name the destination instead of the spur
      const std::string base = s.maneuver == "straight" ? "Continue straight" : s.instruction.substr(0, s.instruction.find(" onto"));
      s.instruction = base + " toward " + toLabel;
    }
    if (li == 0 && s.maneuver != "depart" && !fromLabel.empty()) {
      s.instruction = "From " + fromLabel + ", " + static_cast<char>(std::tolower(static_cast<unsigned char>(s.instruction[0]))) + s.instruction.substr(1);
    }
    steps.push_back(std::move(s));
  }
  (void)lastTurn;

  // 4. arrival
  Step a;
  a.maneuver = "arrive";
  a.instruction = toLabel.empty() ? std::string("You have arrived at your destination") : "Arrive at " + toLabel;
  a.at = route.snappedTo; a.bearing = steps.empty() ? 0 : steps.back().bearing;
  steps.push_back(a);

  // geometry indices (geometry polyline has one vertex per hop boundary, duplicates never occur as hops are non-degenerate)
  size_t gi = 0;
  for (size_t li = 0; li < legs.size(); ++li) {
    steps[li].geomStart = legs[li].first;           // vertex index == hop index in a polyline built from non-degenerate hops
    steps[li].geomEnd = legs[li].last + 1;
    gi = steps[li].geomEnd;
  }
  steps.back().geomStart = steps.back().geomEnd = gi;
  return steps;
}

}  // namespace campus
