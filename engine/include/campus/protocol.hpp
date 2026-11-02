// JSON request/response layer shared by the CLI and the long-running server mode.
#pragma once
#include <memory>
#include <string>
#include "campus/directions.hpp"
#include "campus/graph.hpp"
#include "campus/minijson.hpp"
#include "campus/router.hpp"

namespace campus {

class Engine {
 public:
  explicit Engine(const std::string& campusPath);
  /// Handle one request object. Never throws: errors are reported as {"ok":false,"error":{code,message}}.
  mj::Value handle(const mj::Value& request);
  /// Parse a text line then handle it (JSON errors become BAD_REQUEST responses).
  std::string handleLine(const std::string& line);
  const Graph& graph() const { return *graph_; }

 private:
  struct Resolved { std::vector<Anchor> anchors; std::string label; std::string kind; std::string id; };
  bool resolve(const mj::Value& spec, Resolved* out, std::string* err, std::string* code) const;
  mj::Value route(const mj::Value& req);
  mj::Value info() const;
  std::string path_;
  std::unique_ptr<Graph> graph_;
  std::unique_ptr<Router> router_;
};

mj::Value errorResponse(const std::string& code, const std::string& message, const mj::Value* id = nullptr);

}  // namespace campus
