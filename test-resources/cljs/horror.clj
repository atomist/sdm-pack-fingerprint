(defmacro defbot
  "DSL for registering callbacks for messaging events"
  [& body]
  (let [{:keys [respond hear startup shutdown callback private docs module-startup module-shutdown pre-start bot-id]} (parse-fns body)
        commands (if (map? respond) [respond] respond)
        message-listeners (if (map? hear) [hear] hear)]
    `(let [pns# *ns*
           module-name# (keyword (last (.split (str pns#) "\\.")))]

       (defn ~'pre-start [bot-ref#]
         (when (:fn ~pre-start)
           (mdc/with-logging-context
            (session/team-context bot-ref#)
            (apply (:fn ~pre-start) [bot-ref#]))))

       (defn ~'module-shutdown [bot-ref#]
         (when (:fn ~module-shutdown)
           (mdc/with-logging-context
            (session/team-context bot-ref#)
            (apply (:fn ~module-shutdown) [bot-ref#]))))

       (defn ~'start-this-plugin []
         (when (:fn ~module-startup)
           (apply (:fn ~module-startup) [])))

       (defn ~'load-this-plugin [bot#]
         (when ~startup ((if-seq-error "startup" ~startup) bot#))
         (dosync
          (alter bot# assoc-in [:modules module-name#]
                 {:respond  ~commands
                  :hear     ~message-listeners
                  :callback (into {}
                                  (for [[k# v#] (apply merge-with-conj
                                                       (make-vector ~callback))]
                                    [k# (make-vector v#)]))
                  :shutdown (if-seq-error "shutdown" ~shutdown)
                  :private  (or ~private false)
                  :docs     ~docs
                  :bot-id   ~bot-id}))))))

(defn collect-provided-parameters
  [message parameters]
  (when-not (str/blank? message)
    (when-let [[_ _ command-args] (re-matches #"^(?s)([^\s=]+)(?>\s+)?(.*)" message)]
      (->> command-args
           (re-seq #"(?s)([^\s=]+)=(\"[\s\S]*?(?<!(?<!\\)\\)\"|'[\s\S]*?(?<!(?<!\\)\\)'|“[^”]*”|[^\s]+)")
           (filter (fn [[_ p _]] (parameter-named parameters p)))
           (map (fn [[_ p v]] [p (un-quote v)]))
           (remove nil?)
           (into {})))))

(defn okay [] "okay")