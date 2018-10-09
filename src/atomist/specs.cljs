(ns atomist.specs
  (:require [cljs.spec.alpha :as spec]))

(spec/def ::file any?)
(spec/def ::name string?)
(spec/def ::version string?)
(spec/def ::abbreviation string?)
(spec/def ::sha string?)
(spec/def ::data string?)
(spec/def ::value string?)
(spec/def ::fp-types #{"clojure-project-deps" "maven-project-deps" "npm-project-deps"})

(spec/def ::lib-spec (spec/cat :lib-name string? :lib-version string? :fingerprint-name ::fp-types))
(spec/def ::deps (spec/coll-of ::lib-spec))

(spec/def :fp/data any?)
(spec/def ::fp (spec/keys :req-un [::name ::version ::abbreviation :fp/data]))
(spec/def ::fingerprints (spec/coll-of ::fp))

(spec/def ::fingerprint (spec/keys :req-un [::name ::sha ::data ::value ::version ::abbreviation]))

(spec/def :diff/to (spec/coll-of any?))
(spec/def :diff/from (spec/coll-of any?))
(spec/def :diff/data (spec/keys :req-un [:diff/from :diff/to]))
(spec/def ::from ::fingerprint)
(spec/def ::to ::fingerprint)
(spec/def ::owner string?)
(spec/def ::repo string?)
(spec/def ::channel string?)
(spec/def ::diff (spec/keys :req-un [::from ::to :diff/data ::owner ::repo ::channel]))

