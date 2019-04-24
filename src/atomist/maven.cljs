(ns atomist.maven
  (:require [xml-js]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs.pprint]
            [atomist.json :as json]
            [com.rpl.specter :as s :refer-macros [select transform]]
            [cljs.pprint :refer [pprint]]
            [atomist.cljs-log :as log]
            [cljs.test :refer-macros [deftest testing is run-tests async are] :refer [report testing-vars-str empty-env get-current-env]]
            [cljs.spec.alpha :as spec]
            [atomist.specs :as schema]
            [clojure.string :as string]
            [goog.string :as gstring]
            [goog.string.format]))

(defn xml->clj [f]
  (-> (.xml2json xml-js (slurp f))
      (json/json->clj :keywordize-keys true)))

(defn clj->xml [x]
  (.js2xml xml-js (clj->js x) (clj->js {:spaces 2})))

(defn- element? [x]
  (= "element" (:type x)))

(defn- element-name [s]
  (fn [x] (and
           (element? x)
           (= s (:name x)))))

(def id-fields #{"groupId" "version" "artifactId" "versioning" "packaging"})

(defn- top-level-parent? [x]
  (id-fields (:name x)))

(defn- top-level? [x]
  ((conj id-fields "packaging") (:name x)))

(defn- top-level-dependency? [x]
  ((conj id-fields "scope") (:name x)))

(defn- text [x]
  (apply str (map :text (:elements x))))

(defn- groupId [pom] (text (first (select [:elements s/ALL :elements s/ALL :elements s/ALL (element-name "groupId")] pom))))
(defn- version [pom] (text (first (select [:elements s/ALL :elements s/ALL :elements s/ALL (element-name "version")] pom))))

(defn- default-groupId [pom m]
  (if (not (contains? m :groupId))
    (if-let [from-parent (groupId pom)]
      (assoc m :groupId from-parent)
      (throw (js/Error. "no groupId in pom (or parent pom)")))
    m))

(defn- default-version [pom m]
  (if (not (contains? m :version))
    (if-let [from-parent (version pom)]
      (assoc m :version from-parent)
      (throw (js/Error. "no version in pom (or parent pom)")))
    m))

(defn identity [pom]
  (->>
   (select [:elements s/ALL :elements s/ALL top-level?] pom)
   (map (fn [x] [(keyword (:name x)) (apply str (map :text (:elements x)))]))
   (into {})
   (default-groupId pom)
   (default-version pom)))

(defn dep-map [pom]
  (->>
   (select [:elements s/ALL top-level-dependency?] pom)
   (map (fn [x] [(keyword (:name x)) (apply str (map :text (:elements x)))]))
   (into {})
   (default-groupId pom)))

(defn parent-map [pom]
  (->>
   (select [:elements s/ALL top-level-parent?] pom)
   (map (fn [x] [(keyword (:name x)) (apply str (map :text (:elements x)))]))
   (into {})
   (default-groupId pom)
   (default-version pom)))

(defn ->name-version [x]
  [(str (:groupId x) "/" (:artifactId x)) (:version x)])

(defn ->group-artifact [s]
  (let [[_ group artifact] (re-find #"(.*)/(.*)" s)]
    {:groupId group
     :artifactId artifact}))

(defn dependencies [pom]
  (->> (select [:elements s/ALL :elements s/ALL (element-name "dependencies") :elements s/ALL (element-name "dependency")] pom)
       (map dep-map)
       (filter #(contains? % :version))
       (map ->name-version)
       (into [])))

(defn dependency-management [pom]
  (->> (select [:elements s/ALL :elements s/ALL (element-name "dependencyManagement") :elements s/ALL (element-name "dependencies") :elements s/ALL (element-name "dependency")] pom)
       (map dep-map)
       (filter #(contains? % :version))
       (map ->name-version)
       (into [])))

(defn parent-identity [pom]
  (->> (select [:elements s/ALL :elements s/ALL (element-name "parent")] pom)
       (map parent-map)
       first
       (->name-version)))

(defn- artifact-pred [artifact-id]
  (fn [node]
    (and
     ((element-name "artifactId") node)
     (= artifact-id (text node)))))

(defn- group-pred [group-id]
  (fn [node]
    (and
     ((element-name "groupId") node)
     (= group-id (text node)))))

(defn- parent-predicate
  [group-id artifact-id]
  (fn [node]
    #_(println "check parent " node)
    (and
     ((element-name "parent") node)
     (some (group-pred group-id) (:elements node))
     (some (artifact-pred artifact-id) (:elements node)))))

(defn- dependency-predicate
  [group-id artifact-id]
  (fn [node]
    (and
     ((element-name "dependency") node)
     (some (group-pred group-id) (:elements node))
     (some (artifact-pred artifact-id) (:elements node)))))

(defn update-parent-version [pom {:keys [groupId artifactId version] :as gav}]
  (transform
   [:elements s/ALL :elements s/ALL (parent-predicate groupId artifactId) :elements s/ALL (element-name "version") :elements]
   (constantly [{:type "text" :text version}])
   pom))

(defn update-dependencies [pom {:keys [groupId artifactId version] :as gav}]
  (transform
   [:elements s/ALL :elements s/ALL (element-name "dependencies") :elements s/ALL (dependency-predicate groupId artifactId) :elements s/ALL (element-name "version") :elements]
   (constantly [{:type "text" :text version}])
   pom))

(defn update-dependency-management [pom {:keys [groupId artifactId version] :as gav}]
  (transform
   [:elements s/ALL :elements s/ALL
    (element-name "dependencyManagement") :elements s/ALL
    (element-name "dependencies") :elements s/ALL
    (dependency-predicate groupId artifactId) :elements s/ALL
    (element-name "version") :elements]
   (constantly [{:type "text" :text version}])
   pom))

#_(defn- jfrog-artifactory-plugin-groupId [x]
    (and
     (= "element" (:type x))
     (= "groupId" (:name x))
     (= "org.jfrog.buildinfo" (-> x :elements first :text))))

#_(defn- jfrog-artifactory-plugin-artifactId [x]
    (and
     (= "element" (:type x))
     (= "artifactId" (:name x))
     (= "artifactory-maven-plugin" (-> x :elements first :text))))

#_(defn jfrog-artifactory [pom-clj]
    (if-let [plugin (s/select-first
                     [:elements s/ALL (element-name "project")
                      :elements s/ALL (element-name "build")
                      :elements s/ALL (element-name "plugins")
                      :elements s/ALL (element-name "plugin")
                      #(and
                        (s/select-first [:elements s/ALL jfrog-artifactory-plugin-groupId] %)
                        (s/select-first [:elements s/ALL jfrog-artifactory-plugin-artifactId] %))]
                     pom-clj)]

      [{:name "artifactory-maven-plugin"
        :data plugin
        :abbreviation "artifactory-maven-plugin"
        :version "0.0.1"}]
      []))

#_(defn ensure-build-node [pom-clj]
    (if-not (s/select-first [:elements s/ALL (element-name "project")
                             :elements s/ALL (element-name "build")] pom-clj)
      (s/transform [:elements s/ALL (element-name "project")
                    :elements]
                   #(conj % {:type "element"
                             :name "build"
                             :elements []})
                   pom-clj)
      pom-clj))

#_(defn ensure-plugins-node [pom-clj]
    (if-not (s/select-first [:elements s/ALL (element-name "project")
                             :elements s/ALL (element-name "build")
                             :elements s/ALL (element-name "plugins")] pom-clj)
      (s/transform [:elements s/ALL (element-name "project")
                    :elements s/ALL (element-name "build")
                    :elements]
                   #(conj % {:type "element"
                             :name "plugins"
                             :elements []})
                   pom-clj)
      pom-clj))

#_(defn apply-fingerprint [pom-file {:keys [name data] :as fingerprint}]
    (if (= "artifactory-maven-plugin" name)
      (let [pom-clj (xml->clj pom-file)]
        (->> pom-clj
             (s/transform [:elements s/ALL (element-name "project")
                           :elements s/ALL (element-name "build")
                           :elements s/ALL (element-name "plugins")
                           :elements]
                          #(conj % data))))))

#_(comment
   (pprint (jfrog-artifactory (xml->clj "test-resources/jfrog-pom/pom.xml")))
   (pprint (jfrog-artifactory (xml->clj "test-resources/jfrog-pom/pom1.xml")))
   (->
    (apply-fingerprint "test-resources/jfrog-pom/pom2.xml"
                       {:data {:type "element"
                               :name "plugin"
                               :elements [{:type "text" :text "shit"}]}})
    (clj->xml)
    (println))
   (->
    (apply-fingerprint "test-resources/jfrog-pom/pom3.xml"
                       {:data {:type "element"
                               :name "plugin"
                               :elements [{:type "text" :text "shit"}]}})
    (clj->xml)
    (println)))


;; pom1.xml -- this is the parent pom that all apps use - it extends from spring-boot
;; pom2.xml -- this is the parent pom of the previous pom
;; difference between 3.8.2 and [3.8.2] as a range (the latter can cause an error of there is a conflict)
;; ranges are in the dependencies section
;; you'll usually see the dependencyManagement section in top-level pom for a team
;; in maven dependency-management version are only used if the child does not specify a version
;; dependency-managenent sections can contain dependencies that are never actually used.  They do not go into the tree in those cases
;; dependency-management sections are allowed to include import scopes
;; http://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html#Dependency_Management

(defn edit [basedir n v]
  (log/info "maven edit" basedir n v))

(defn apply-fingerprint
  [pom-file {:keys [name] [lib-name lib-version] :data}]
  (log/infof "apply %s@%s to %s" lib-name lib-version pom-file)
  (let [pom-xml (io/file pom-file)
        gav (assoc (->group-artifact lib-name) :version lib-version)]
    (when (and
           (string/starts-with? name "maven-project-deps")
           (.exists pom-xml))
      (-> (xml->clj pom-xml)
          (update-parent-version gav)
          (update-dependencies gav)
          (update-dependency-management gav)
          (clj->xml)
          (->> (spit pom-xml))))))

(defn run [f]
  (try
    (log/info "maven project-dependencies from " f)
    (let [pom-xml (io/file f)]
      (if (.exists pom-xml)
        (let [pom (xml->clj pom-xml)
              coords (identity pom)
              data (->> (dependencies pom)
                        (concat (dependency-management pom))
                        (cons (parent-identity pom))
                        (into []))]
          (-> []
              (concat (for [dep data]
                        {:name (gstring/format "maven-project-deps::%s" (gstring/replaceAll (nth dep 0) "/" "::"))
                         :data (into [] (take 2 dep))
                         :abbreviation "maven-deps"
                         :version "0.0.1"}))
              (conj {:name "maven-project-coordinates"
                     :data {:name (str (:groupId coords) "/" (:artifactId coords))
                            :version (:version coords)}
                     :abbreviation "coords"
                     :version "0.0.1"})))
        []))
    (catch :default e
      (log/info (str e))
      (log/info "error running dep fingerprints for pom.xml")
      [])))
(spec/fdef run
           :args (spec/cat :file ::schema/file)
           :ret ::schema/fingerprints)

(deftest dependency-update-tests
  (testing "dependency management update"
    (is
     (=
      [{:type "element",
        :name "dependency",
        :elements
        [{:type "element",
          :name "groupId",
          :elements [{:type "text", :text "com.amazonaws"}]}
         {:type "element",
          :name "artifactId",
          :elements [{:type "text", :text "aws-java-sdk-bom"}]}
         {:type "element",
          :name "version",
          :elements [{:type "text", :text "1.2.3"}]}
         {:type "element",
          :name "type",
          :elements [{:type "text", :text "pom"}]}
         {:type "element",
          :name "scope",
          :elements [{:type "text", :text "import"}]}]}]
      (-> (xml->clj "test-resources/maven/pom.xml")
          (update-dependency-management {:groupId "com.amazonaws"
                                         :artifactId "aws-java-sdk-bom"
                                         :version "1.2.3"})
          (->> (select [:elements s/ALL :elements s/ALL
                        (element-name "dependencyManagement") :elements s/ALL
                        (element-name "dependencies") :elements s/ALL
                        (dependency-predicate "com.amazonaws" "aws-java-sdk-bom")]))))))
  (testing "dependencies section update"
    (is
     (=
      [{:type "element",
        :name "dependency",
        :elements
        [{:type "element",
          :name "groupId",
          :elements [{:type "text", :text "com.dealer.webplatform"}]}
         {:type "element",
          :name "artifactId",
          :elements [{:type "text", :text "jvms-spring-boot-starter"}]}
         {:type "element",
          :name "version",
          :elements [{:type "text", :text "1.2.3"}]}]}]
      (-> (xml->clj "test-resources/maven/pom.xml")
          (update-dependencies {:groupId "com.dealer.webplatform"
                                :artifactId "jvms-spring-boot-starter"
                                :version "1.2.3"})
          (->> (select [:elements s/ALL :elements s/ALL (element-name "dependencies") :elements s/ALL (dependency-predicate "com.dealer.webplatform" "jvms-spring-boot-starter")])))))))

(deftest parent-fingerprint-update-tests
  (testing "that parent pom can be updated by a fingerprint"
    (is
     (=
      (-> (xml->clj "test-resources/maven/pom.xml")
          (update-parent-version {:groupId "org.springframework.boot"
                                  :artifactId "spring-boot-starter-parent"
                                  :version "1.2.3"})
          (->> (select [:elements s/ALL :elements s/ALL (element-name "parent") :elements s/ALL (element-name "version")])))
      [{:type "element" :name "version" :elements [{:type "text" :text "1.2.3"}]}])))
  (testing "that we skip parent pom if the fingerprint is a different group or artifact"
    (is
     (=
      (-> (xml->clj "test-resources/maven/pom.xml")
          (update-parent-version {:groupId "org.springframework.boot1"
                                  :artifactId "spring-boot-starter-parent"
                                  :version "1.2.3"})
          (->> (select [:elements s/ALL :elements s/ALL (element-name "parent") :elements s/ALL (element-name "version")])))
      [{:type "element" :name "version" :elements [{:type "text" :text "2.0.3.RELEASE"}]}]))))

(deftest fingerprint-tests
  (cljs.test/update-current-env! [:formatter] (constantly pprint))
  (testing "fingerprints"
    (is (= [{:name "maven-project-coordinates"
             :data {:name "com.dealer.webplatform/jvms-parent-pom" :version "2.6.4-SNAPSHOT"}
             :abbreviation "coords"
             :version "0.0.1"}
            {:name
             "maven-project-deps::org.springframework.boot::spring-boot-starter-parent",
             :data
             ["org.springframework.boot/spring-boot-starter-parent"
              "2.0.3.RELEASE"],
             :abbreviation "maven-deps",
             :version "0.0.1"}
            {:name "maven-project-deps::com.amazonaws::aws-java-sdk-bom",
             :data ["com.amazonaws/aws-java-sdk-bom" "1.11.308"],
             :abbreviation "maven-deps",
             :version "0.0.1"}
            {:name "maven-project-deps::com.google.guava::guava",
             :data ["com.google.guava/guava" "24.0-jre"],
             :abbreviation "maven-deps",
             :version "0.0.1"}
            {:name
             "maven-project-deps::com.dealer.webplatform::jvms-spring-boot-starter",
             :data
             ["com.dealer.webplatform/jvms-spring-boot-starter"
              "2.6.4-SNAPSHOT"],
             :abbreviation "maven-deps",
             :version "0.0.1"}
            {:name
             "maven-project-deps::com.dealer.webplatform::jvms-spring-boot-test",
             :data
             ["com.dealer.webplatform/jvms-spring-boot-test" "2.6.4-SNAPSHOT"],
             :abbreviation "maven-deps",
             :version "0.0.1"}]
           (run "test-resources/maven/pom1.xml"))
        "fingerprints are wrong")))

(deftest dependency-tests
  (cljs.test/update-current-env! [:formatter] (constantly pprint))
  (let [pom (xml->clj "test-resources/maven/pom1.xml")
        parent-pom (xml->clj "test-resources/maven/pom2.xml")]
    (are [x y] (= x y)
               ["org.springframework.boot/spring-boot-starter-parent"
                "2.0.3.RELEASE"] (parent-identity pom)
               ["com.dealer.webplatform/jvm-scripts-parent" "2.6.4-SNAPSHOT"] (parent-identity parent-pom)
               [["com.dealer.webplatform/jvms-spring-boot-starter" "2.6.4-SNAPSHOT"]
                ["com.dealer.webplatform/jvms-spring-boot-test" "2.6.4-SNAPSHOT"]] (dependencies pom)
               [["io.freefair.okhttp-spring-boot/okhttp-spring-boot-autoconfigure"
                 "2.0.0-rc3"]
                ["com.dealer.webplatform/fookeeper-spring-boot-starter" "1.2.3"]
                ["com.dealer.webplatform/launch-darkly-spring-boot-starter" "1.1.1"]
                ["org.checkerframework/checker-qual" "2.4.0"]
                ["com.newrelic.agent.java/newrelic-api" "${newrelic-agent.version}"]
                ["io.springfox/springfox-swagger2" "${swagger.version}"]
                ["io.springfox/springfox-swagger-ui" "${swagger.version}"]
                ["com.squareup.retrofit2/retrofit" "${retrofit.version}"]
                ["com.squareup.retrofit2/adapter-java8" "${retrofit.version}"]
                ["com.squareup.retrofit2/converter-java8" "${retrofit.version}"]
                ["com.squareup.retrofit2/converter-jackson" "${retrofit.version}"]
                ["io.github.resilience4j/resilience4j-circuitbreaker"
                 "${resilience4j.version}"]] (dependencies parent-pom)
               [["com.amazonaws/aws-java-sdk-bom" "1.11.308"]
                ["com.google.guava/guava" "24.0-jre"]] (dependency-management pom))))
