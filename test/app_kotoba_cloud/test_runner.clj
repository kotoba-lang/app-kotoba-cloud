(ns app-kotoba-cloud.test-runner
  (:require [app-kotoba-cloud.profile-test]
            [clojure.test :as test]))

(defn -main [& _]
  (let [result (test/run-tests 'app-kotoba-cloud.profile-test)]
    (when (pos? (+ (:fail result) (:error result)))
      (System/exit 1))))

