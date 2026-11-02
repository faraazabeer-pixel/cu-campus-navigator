// Dijkstra shortest-path engine over the pedestrian graph.
//  * multi-source / multi-target  (a building with several entrances is one endpoint)
//  * arbitrary map points are snapped onto the nearest walkable edge (virtual nodes)
//  * routing profiles (walk, accessible) so indoor/step-free routing can be added later
#pragma once
#include <string>
#include <vector>
#include "campus/graph.hpp"

namespace campus {

enum class Profile { Walk, Accessible };
Profile parseProfile(const std::string& s, bool* ok = nullptr);
const char* profileName(Profile p);

/// A routing endpoint: either an existing graph node or a free point to be snapped to the network.
struct Anchor {
  enum Kind { NodeAnchor, PointAnchor } kind = NodeAnchor;
  int node = -1;       // NodeAnchor
  Point point;         // PointAnchor
};

/// One straight segment of a computed route.
struct Hop {
  Point from, to;
  int edge = -1;             // index into Graph::edges
  int fromNode = -1, toNode = -1;  // graph node indices, -1 for virtual (snapped) nodes
  double len = 0;
};

struct RouteStats { long expanded = 0; long relaxed = 0; double micros = 0; };

enum class TraceEventType { Init, Pop, Skip, Settle, Relax, ReachGoal, Done };

struct TraceStep {
  TraceEventType type = TraceEventType::Init;
  int node = -1;
  std::string nodeId;
  Point nodePos;
  int neighborNode = -1;
  std::string neighborId;
  Point neighborPos;
  int edge = -1;
  std::string edgeId;
  double currentDist = 0;
  double edgeCost = 0;
  double oldDist = 0;
  double newDist = 0;
  int prevNode = -1;
  std::string prevNodeId;
  int pqSize = 0;
  double minPqDist = 0;
};

struct RouteResult {
  bool found = false;
  double distance = 0;       // metres (sum of Hop::len)
  double cost = 0;           // profile cost used by Dijkstra
  std::vector<Hop> hops;
  std::vector<int> nodePath; // real graph nodes visited, in order
  int sourceAnchor = -1, targetAnchor = -1;  // which seed / target won
  Point snappedFrom, snappedTo;              // actual start/end positions on the network
  double snapFromDist = 0, snapToDist = 0;   // metres between requested point and the network
  RouteStats stats;
  std::vector<TraceStep> trace;
};

class Router {
 public:
  explicit Router(const Graph& g) : g_(g) {}
  /// Shortest route from any of `from` to any of `to`. Throws std::invalid_argument on bad anchors.
  RouteResult route(const std::vector<Anchor>& from, const std::vector<Anchor>& to, Profile profile = Profile::Walk, bool recordTrace = false) const;

  /// Nearest point on the walkable network (edges allowed under `profile`). Returns false if network is empty.
  bool snap(Point p, Profile profile, Point* out, int* edge, double* t, double* dist) const;

  static double speed(EdgeKind k);          // m/s
  static double edgeCost(const Edge& e, Profile p);  // < 0 means forbidden
  double duration(const RouteResult& r) const;

 private:
  const Graph& g_;
};

}  // namespace campus
