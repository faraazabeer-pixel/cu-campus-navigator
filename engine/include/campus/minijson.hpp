// Minimal, dependency-free JSON reader/writer used by the routing engine.
// Supports the full JSON grammar (incl. \uXXXX escapes and surrogate pairs).
#pragma once
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace mj {

struct ParseError : std::runtime_error {
  using std::runtime_error::runtime_error;
};

class Value {
 public:
  enum Type { Null, Bool, Number, String, Array, Object };
  Value() = default;
  Value(std::nullptr_t) {}
  Value(bool b) : type_(Bool), b_(b) {}
  Value(int n) : type_(Number), n_(n) {}
  Value(long n) : type_(Number), n_(static_cast<double>(n)) {}
  Value(unsigned long n) : type_(Number), n_(static_cast<double>(n)) {}
  Value(double n) : type_(Number), n_(n) {}
  Value(const char* s) : type_(String), s_(s) {}
  Value(std::string s) : type_(String), s_(std::move(s)) {}

  static Value array() { Value v; v.type_ = Array; return v; }
  static Value object() { Value v; v.type_ = Object; return v; }

  Type type() const { return type_; }
  bool isNull() const { return type_ == Null; }
  bool isBool() const { return type_ == Bool; }
  bool isNumber() const { return type_ == Number; }
  bool isString() const { return type_ == String; }
  bool isArray() const { return type_ == Array; }
  bool isObject() const { return type_ == Object; }

  bool asBool(bool d = false) const { return type_ == Bool ? b_ : d; }
  double asNumber(double d = 0) const { return type_ == Number ? n_ : d; }
  const std::string& asString() const { static const std::string e; return type_ == String ? s_ : e; }

  const std::vector<Value>& items() const { return arr_; }
  std::vector<Value>& items() { return arr_; }
  size_t size() const { return type_ == Array ? arr_.size() : keys_.size(); }
  const Value& at(size_t i) const { return arr_.at(i); }

  void push(Value v) { arr_.push_back(std::move(v)); }
  void set(const std::string& k, Value v) {
    for (size_t i = 0; i < keys_.size(); ++i) if (keys_[i] == k) { arr_[i] = std::move(v); return; }
    keys_.push_back(k); arr_.push_back(std::move(v));
  }
  const Value* find(const std::string& k) const {
    if (type_ != Object) return nullptr;
    for (size_t i = 0; i < keys_.size(); ++i) if (keys_[i] == k) return &arr_[i];
    return nullptr;
  }
  const Value& operator[](const std::string& k) const {
    static const Value nullv;
    const Value* v = find(k);
    return v ? *v : nullv;
  }
  const std::vector<std::string>& keys() const { return keys_; }

  std::string dump() const { std::string out; write(out); return out; }

 private:
  void write(std::string& o) const;
  Type type_ = Null;
  bool b_ = false;
  double n_ = 0;
  std::string s_;
  std::vector<Value> arr_;          // array items, or object values
  std::vector<std::string> keys_;   // object keys (parallel to arr_)
};

inline void escapeInto(std::string& o, const std::string& s) {
  o.push_back('"');
  for (unsigned char c : s) {
    switch (c) {
      case '"': o += "\\\""; break;
      case '\\': o += "\\\\"; break;
      case '\n': o += "\\n"; break;
      case '\r': o += "\\r"; break;
      case '\t': o += "\\t"; break;
      default:
        if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
        else o.push_back(static_cast<char>(c));
    }
  }
  o.push_back('"');
}

inline void formatNumber(std::string& o, double n) {
  if (!std::isfinite(n)) { o += "null"; return; }
  char b[40];
  if (n == std::floor(n) && std::fabs(n) < 1e15) std::snprintf(b, sizeof b, "%.0f", n);
  else {
    std::snprintf(b, sizeof b, "%.3f", n);
    std::string t(b);
    while (!t.empty() && t.back() == '0') t.pop_back();
    if (!t.empty() && t.back() == '.') t.pop_back();
    if (t == "-0") t = "0";
    o += t; return;
  }
  o += b;
}

inline void Value::write(std::string& o) const {
  switch (type_) {
    case Null: o += "null"; break;
    case Bool: o += b_ ? "true" : "false"; break;
    case Number: formatNumber(o, n_); break;
    case String: escapeInto(o, s_); break;
    case Array:
      o.push_back('[');
      for (size_t i = 0; i < arr_.size(); ++i) { if (i) o.push_back(','); arr_[i].write(o); }
      o.push_back(']'); break;
    case Object:
      o.push_back('{');
      for (size_t i = 0; i < keys_.size(); ++i) { if (i) o.push_back(','); escapeInto(o, keys_[i]); o.push_back(':'); arr_[i].write(o); }
      o.push_back('}'); break;
  }
}

class Parser {
 public:
  explicit Parser(const std::string& s) : s_(s) {}
  Value parse() {
    skip();
    Value v = value(0);
    skip();
    if (p_ != s_.size()) fail("trailing characters");
    return v;
  }
 private:
  const std::string& s_;
  size_t p_ = 0;
  [[noreturn]] void fail(const std::string& m) const { throw ParseError("JSON parse error at offset " + std::to_string(p_) + ": " + m); }
  void skip() { while (p_ < s_.size() && (s_[p_] == ' ' || s_[p_] == '\n' || s_[p_] == '\t' || s_[p_] == '\r')) ++p_; }
  bool lit(const char* w) { size_t n = std::char_traits<char>::length(w); if (s_.compare(p_, n, w) == 0) { p_ += n; return true; } return false; }
  Value value(int depth) {
    if (depth > 200) fail("nesting too deep");
    if (p_ >= s_.size()) fail("unexpected end");
    char c = s_[p_];
    if (c == '{') return object(depth);
    if (c == '[') return array(depth);
    if (c == '"') return Value(str());
    if (lit("true")) return Value(true);
    if (lit("false")) return Value(false);
    if (lit("null")) return Value();
    return number();
  }
  Value number() {
    size_t st = p_;
    if (p_ < s_.size() && s_[p_] == '-') ++p_;
    if (p_ >= s_.size() || !std::isdigit(static_cast<unsigned char>(s_[p_]))) fail("invalid value");
    while (p_ < s_.size() && std::isdigit(static_cast<unsigned char>(s_[p_]))) ++p_;
    if (p_ < s_.size() && s_[p_] == '.') { ++p_; if (p_ >= s_.size() || !std::isdigit(static_cast<unsigned char>(s_[p_]))) fail("bad fraction"); while (p_ < s_.size() && std::isdigit(static_cast<unsigned char>(s_[p_]))) ++p_; }
    if (p_ < s_.size() && (s_[p_] == 'e' || s_[p_] == 'E')) { ++p_; if (p_ < s_.size() && (s_[p_] == '+' || s_[p_] == '-')) ++p_; if (p_ >= s_.size() || !std::isdigit(static_cast<unsigned char>(s_[p_]))) fail("bad exponent"); while (p_ < s_.size() && std::isdigit(static_cast<unsigned char>(s_[p_]))) ++p_; }
    return Value(std::strtod(s_.substr(st, p_ - st).c_str(), nullptr));
  }
  static void utf8(std::string& o, unsigned cp) {
    if (cp < 0x80) o.push_back(static_cast<char>(cp));
    else if (cp < 0x800) { o.push_back(static_cast<char>(0xC0 | (cp >> 6))); o.push_back(static_cast<char>(0x80 | (cp & 0x3F))); }
    else if (cp < 0x10000) { o.push_back(static_cast<char>(0xE0 | (cp >> 12))); o.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F))); o.push_back(static_cast<char>(0x80 | (cp & 0x3F))); }
    else { o.push_back(static_cast<char>(0xF0 | (cp >> 18))); o.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F))); o.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F))); o.push_back(static_cast<char>(0x80 | (cp & 0x3F))); }
  }
  unsigned hex4() {
    if (p_ + 4 > s_.size()) fail("bad \\u escape");
    unsigned v = 0;
    for (int i = 0; i < 4; ++i) {
      char c = s_[p_++]; v <<= 4;
      if (c >= '0' && c <= '9') v |= c - '0'; else if (c >= 'a' && c <= 'f') v |= c - 'a' + 10; else if (c >= 'A' && c <= 'F') v |= c - 'A' + 10; else fail("bad hex digit");
    }
    return v;
  }
  std::string str() {
    ++p_;
    std::string o;
    while (true) {
      if (p_ >= s_.size()) fail("unterminated string");
      char c = s_[p_++];
      if (c == '"') break;
      if (static_cast<unsigned char>(c) < 0x20) fail("control character in string");
      if (c != '\\') { o.push_back(c); continue; }
      if (p_ >= s_.size()) fail("bad escape");
      char e = s_[p_++];
      switch (e) {
        case '"': o.push_back('"'); break; case '\\': o.push_back('\\'); break; case '/': o.push_back('/'); break;
        case 'b': o.push_back('\b'); break; case 'f': o.push_back('\f'); break; case 'n': o.push_back('\n'); break;
        case 'r': o.push_back('\r'); break; case 't': o.push_back('\t'); break;
        case 'u': {
          unsigned cp = hex4();
          if (cp >= 0xD800 && cp < 0xDC00) {
            if (p_ + 2 <= s_.size() && s_[p_] == '\\' && s_[p_ + 1] == 'u') { p_ += 2; unsigned lo = hex4(); if (lo < 0xDC00 || lo > 0xDFFF) fail("bad surrogate"); cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); }
            else fail("lone surrogate");
          }
          utf8(o, cp); break;
        }
        default: fail("bad escape");
      }
    }
    return o;
  }
  Value array(int depth) {
    ++p_; Value a = Value::array(); skip();
    if (p_ < s_.size() && s_[p_] == ']') { ++p_; return a; }
    while (true) {
      skip(); a.push(value(depth + 1)); skip();
      if (p_ >= s_.size()) fail("unterminated array");
      if (s_[p_] == ',') { ++p_; continue; }
      if (s_[p_] == ']') { ++p_; return a; }
      fail("expected , or ]");
    }
  }
  Value object(int depth) {
    ++p_; Value o = Value::object(); skip();
    if (p_ < s_.size() && s_[p_] == '}') { ++p_; return o; }
    while (true) {
      skip();
      if (p_ >= s_.size() || s_[p_] != '"') fail("expected string key");
      std::string k = str(); skip();
      if (p_ >= s_.size() || s_[p_] != ':') fail("expected :");
      ++p_; skip();
      o.set(k, value(depth + 1)); skip();
      if (p_ >= s_.size()) fail("unterminated object");
      if (s_[p_] == ',') { ++p_; continue; }
      if (s_[p_] == '}') { ++p_; return o; }
      fail("expected , or }");
    }
  }
};

inline Value parse(const std::string& s) { return Parser(s).parse(); }

}  // namespace mj
