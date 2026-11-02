// route_engine - C++17 Dijkstra routing engine for the campus walking network.
//
//   route_engine serve <campus.json>                         JSON-lines server on stdin/stdout
//   route_engine route <campus.json> <from> <to> [--profile walk|accessible] [--pretty]
//   route_engine info  <campus.json>
//
// <from>/<to> may be a place id, a node id, or "x,z" campus-local metres.
#include <cstdio>
#include <iostream>
#include <string>

#include "campus/protocol.hpp"

using namespace campus;

static int usage() {
  std::fprintf(stderr,
    "usage:\n  route_engine serve <campus.json>\n  route_engine route <campus.json> <from> <to> [--profile walk|accessible] [--visualize] [--pretty]\n  route_engine info <campus.json>\n");
  return 2;
}

static void pretty(const mj::Value& r) {
  if (!r["ok"].asBool()) { std::printf("error [%s]: %s\n", r["error"]["code"].asString().c_str(), r["error"]["message"].asString().c_str()); return; }
  if (!r["found"].asBool()) { std::printf("%s\n", r["message"].asString().c_str()); return; }
  std::printf("%s -> %s\n", r["from"]["label"].asString().c_str(), r["to"]["label"].asString().c_str());
  std::printf("distance %.1f m, about %.1f min walking (%s profile)\n\n", r["distance"].asNumber(), r["duration"].asNumber() / 60.0, r["profile"].asString().c_str());
  int i = 1;
  for (const auto& s : r["steps"].items()) {
    if (s["maneuver"].asString() == "arrive") std::printf("%2d. %s\n", i++, s["instruction"].asString().c_str());
    else std::printf("%2d. %s  (%.0f m)\n", i++, s["instruction"].asString().c_str(), s["distance"].asNumber());
  }
  std::printf("\nDijkstra expanded %.0f nodes in %.0f us\n", r["stats"]["expanded"].asNumber(), r["stats"]["micros"].asNumber());
}

int main(int argc, char** argv) {
  if (argc < 3) return usage();
  const std::string cmd = argv[1], path = argv[2];
  try {
    Engine engine(path);
    if (cmd == "info") { std::puts(engine.handle(mj::parse("{\"op\":\"info\"}")).dump().c_str()); return 0; }
    if (cmd == "serve") {
      std::ios::sync_with_stdio(false);
      std::string line;
      std::cout << engine.handle(mj::parse("{\"op\":\"info\",\"ready\":true}")).dump() << "\n" << std::flush;
      while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        std::cout << engine.handleLine(line) << "\n" << std::flush;
      }
      return 0;
    }
    if (cmd == "route") {
      if (argc < 5) return usage();
      mj::Value req = mj::Value::object();
      req.set("op", "route"); req.set("from", std::string(argv[3])); req.set("to", std::string(argv[4]));
      bool pr = false;
      for (int i = 5; i < argc; ++i) {
        std::string a = argv[i];
        if (a == "--pretty") pr = true;
        else if (a == "--visualize") req.set("visualize", true);
        else if (a == "--profile" && i + 1 < argc) req.set("profile", std::string(argv[++i]));
        else return usage();
      }
      mj::Value r = engine.handle(req);
      if (pr) pretty(r); else std::puts(r.dump().c_str());
      return r["ok"].asBool() ? 0 : 1;
    }
    return usage();
  } catch (const std::exception& e) {
    mj::Value r = errorResponse("STARTUP_FAILED", e.what());
    std::puts(r.dump().c_str());
    return 2;
  }
}
