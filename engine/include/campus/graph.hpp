// Pedestrian network model. All distances are metres in the campus-local frame
// (x = east, z = south).
#pragma once
#include <string>
#include <unordered_map>
#include <vector>
#include "campus/minijson.hpp"

namespace campus {

enum class EdgeKind { Footpath, Sidewalk, Plaza, Crossing, Entrance, Stairs, Ramp, Elevator, Indoor };

struct Point { double x = 0, z = 0; };

struct Node {
  std::string id;
  Point p;
  int level = 0;                // 0 = ground; indoor floors use other values
  std::string kind;             // junction | entrance | ...
  std::string landmark;         // nearest named place, for direction text
};

struct Edge {
  int a = 0, b = 0;
  double len = 0;
  EdgeKind kind = EdgeKind::Footpath;
  std::string id, name, crosses;
};

struct Place {
  std::string id, name, category;
  std::vector<int> entrances;   // node indices
  Point centroid;
};

class Graph {
 public:
  /// Build from the runtime campus JSON (data/campus.json). Throws std::runtime_error on invalid data.
  static Graph fromJson(const mj::Value& root);
  static Graph fromFile(const std::string& path);

  std::vector<Node> nodes;
  std::vector<Edge> edges;
  std::vector<Place> places;
  std::vector<std::vector<int>> adj;  // node -> incident edge indices

  int nodeIndex(const std::string& id) const;   // -1 if unknown
  int placeIndex(const std::string& id) const;  // -1 if unknown
  int otherEnd(const Edge& e, int n) const { return e.a == n ? e.b : e.a; }

 private:
  std::unordered_map<std::string, int> nodeIdx_, placeIdx_;
};

EdgeKind parseKind(const std::string& s);
const char* kindName(EdgeKind k);

}  // namespace campus
