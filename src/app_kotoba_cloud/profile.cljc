(ns app-kotoba-cloud.profile)

(def schema "https://kotoba.cloud/schemas/control-plane/v1")

(def control-plane
  {:schema schema
   :service "kotoba-cloud"
   :version "1"
   :roles
   {:identity {:origin "https://auth.kotoba.cloud"
               :rpId "auth.kotoba.cloud"
               :purpose "stable-principal-and-controller-authentication"}
    :control {:origin "https://api.kotoba.cloud"
              :purpose "cli-and-deploy-control"}
    :storage {:origin "https://kotobase.net"
              :purpose "content-addressed-artifacts-state-and-receipts"}
    :compute {:origin "https://api.murakumo.cloud"
              :publicOrigin "https://murakumo.cloud"
              :purpose "cpu-gpu-placement-and-execution"}
    :agentWork {:origin "https://itonami.cloud"
                :purpose "agent-workspaces-goals-tools-and-approvals"}
    :language {:origin "https://kotoba-lang.org"
               :purpose "language-specification-documentation-and-conformance"}}
   :deploy
   {:mode "local-admission-remote-compute"
    :hostedApply false
    :controlOrigin "https://api.kotoba.cloud"
    :storageOrigin "https://kotobase.net"
    :computeOrigin "https://api.murakumo.cloud"
    :publicComputeOrigin "https://murakumo.cloud"
    :agentWorkOrigin "https://itonami.cloud"}
   :libraries
   {:catalogOrigin "https://kotoba-lang.org"
    :catalogPath "/libraries/"
    :machineCatalogPath "/.well-known/kotoba-libraries.json"
    :storageOrigin "https://kotobase.net"
    :inspectCommand "kotoba library inspect"
    :publishCommand "kotoba library publish"
    :publishMode "local-signed-passkey-relay"
    :defaultDryRun true
    :hostedPasskeyPublish true
    :hostedPublishEndpoint "https://kotoba.cloud/v1/libraries/publish"
    :requestSchema "https://kotoba.cloud/schemas/library-publication-request/v1"}
   :security
   {:passkeyRpId "auth.kotoba.cloud"
    :passkeyOrigin "https://auth.kotoba.cloud"
    :sessionCookieScope "registrable-domain:kotoba.cloud"
    :sessionProjection "https://kotoba.cloud/v1/session"
    :untrustedDeploymentsUnderKotobaCloud false}})

(defn valid-profile?
  [profile]
  (and (= schema (:schema profile))
       (= "https://auth.kotoba.cloud" (get-in profile [:roles :identity :origin]))
       (= "auth.kotoba.cloud" (get-in profile [:roles :identity :rpId]))
       (= "registrable-domain:kotoba.cloud"
          (get-in profile [:security :sessionCookieScope]))
       (= "https://kotoba.cloud/v1/session"
          (get-in profile [:security :sessionProjection]))
       (= "https://kotobase.net" (get-in profile [:roles :storage :origin]))
       (= "https://api.murakumo.cloud" (get-in profile [:roles :compute :origin]))
       (= "https://itonami.cloud" (get-in profile [:roles :agentWork :origin]))
       (false? (get-in profile [:deploy :hostedApply]))
       (= "https://kotoba-lang.org" (get-in profile [:libraries :catalogOrigin]))
       (= "https://kotobase.net" (get-in profile [:libraries :storageOrigin]))
       (true? (get-in profile [:libraries :defaultDryRun]))
       (true? (get-in profile [:libraries :hostedPasskeyPublish]))))
