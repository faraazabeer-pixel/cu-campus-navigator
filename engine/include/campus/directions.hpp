// Turn-by-turn instruction generation from a computed route.
#pragma once
#include <string>
#include <vector>
#include "campus/graph.hpp"
#include "campus/router.hpp"

namespace campus {

struct Step {
  std::string maneuver;     // depart | straight | slight-left | left | sharp-left | slight-right | right | sharp-right | cross | stairs | arrive
  std::string instruction;  // human readable, without distance
  std::string name;         // path name the step follows
  std::string landmark;     // nearby named place, may be empty
  double distance = 0;      // metres
  double duration = 0;      // seconds
  double bearing = 0;       // compass bearing of travel, degrees clockwise from north
  Point at;                 // where the step starts
  size_t geomStart = 0, geomEnd = 0;  // indices into the route geometry polyline
};

/// Compass bearing (0 = north = -z, 90 = east = +x).
double bearingDeg(const Point& a, const Point& b);
const char* compass8(double bearing);

std::vector<Step> buildDirections(const Graph& g, const Router& r, const RouteResult& route,
                                  const std::string& fromLabel, const std::string& toLabel);

/// Route geometry as a polyline (start, every intermediate node, end), duplicates removed.
std::vector<Point> routeGeometry(const RouteResult& route);

}  // namespace campus
