
/**
 * Types:  project Fingerprint types
 */
export declare interface FP {name: string, sha: string, data: any, version: string, abbreviation: string}
export declare interface Vote {
    ballot?: any,
    abstain: boolean,
    decision?: string,
    name?: string,
    fingerprint?: FP,
    fpTarget?: FP,
    diff?: Diff,
    text?: string,
    summary?: {title: string, description: string},
}
export declare interface VoteResults {
    failed: boolean,
    failedFps: string[],
    successFps: string[],
    failedVotes: Vote[],
}
export declare function voteResults(votes: Vote[]): VoteResults;

/**
 * Fingerprint Push Impact support function - processPushImpact
 * (to rewrite in typescript someday)
 */
export declare interface DiffData {from: any[], to: any[]}
export declare interface Diff {from: FP, to: FP, data: DiffData, owner: string, repo: string, sha: string, providerId: string, channel: string, branch: string}
export declare interface Handler {selector: (a:FP) => boolean,
                                  action?: (b:Diff) => Promise<Vote>,
                                  diffAction?: (b:Diff) => Promise<Vote>,
                                  ballot?: (votes: Vote[]) => boolean}
// event is the PushImpact subscription data
// getFingerprintData returns application/json - return "{}" if data is empty
// handlers select and action the push impacts for different fingerprints
export declare function processPushImpact(event: any,
                                          getFingerprintData: (sha: string, name: string) => Promise<string>,
                                          handlers: Handler[]): Promise<any>

// send a message if any project fingerprints are out of sync with the target state
export declare function checkFingerprintTargets(queryPreferences: () => Promise<any>,
                                                sendMessage: (s: string, targetFP: FP, fingerprint: FP) => Promise<Vote>,
                                                inSync: (fingerprint: FP) => Promise<Vote>,
                                                diff: Diff
                                                ): Promise<Vote>

/**
 * Clojure fingerprint computations and editors
 */
export declare function depsFingerprints( f1:string ): Promise<FP[]>
export declare function logbackFingerprints( f1:string ): Promise<FP[]>
export declare function cljFunctionFingerprints( f1:string ): Promise<FP[]>
export declare function getFingerprintPreference(query: () => Promise<any> ,fpName:string): Promise<FP>
export declare function applyFingerprint(f1:string, fp: FP): Promise<any>
export declare function fpPreferences(query: any): FP[]
export declare function fpPreference(query: any, fpName: string): FP

/**
 * Utility functions to rewrite in typescript
 */
export declare function renderDiff( diff: Diff): string
export declare function renderOptions( options: {text: string, value: string}[]): string
export declare function renderData(x: any): string
export declare function commaSeparatedList(x: any): string
export declare function sha256( data: string): string
export declare function consistentHash(data: any): string
export declare function renderClojureProjectDiff(diff: Diff, target: FP): {title: "string", description: string}

// choose a new library target and set it in the team wide preferences
// we use this to set a new fingerprint target
export declare function setGoalFingerprint( queryPreferences: () => Promise<any>,
                                            queryFingerprintBySha: (name: string, sha: string) => Promise<any>,
                                            mutatePreference: (prefName: string, chatTeamId: string, prefsAsJson: string) => Promise<any>,
                                            name: string,
                                            sha: string
                                            ): Promise<boolean>
export declare function setTargetFingerprint( queryPreferences: () => Promise<any>,
                                              mutatePreference: (prefName: string, chatTeamId: string, prefsAsJson: string) => Promise<any>,
                                              fp: string,
                                            ): Promise<boolean>

export declare function deleteGoalFingerprint( queryPreferences: () => Promise<any>,
                                               mutatePreference: (prefName: string, chatTeamId: string, prefsAsJson: string) => Promise<any>,
                                               name: string): Promise<boolean>

// fire callbacks for all project consuming a library when a new library target is set
// we use this to broadcast a new library goal to all projects that might be impacted
export declare function broadcastFingerprint( queryFingerprints: (name: string) => Promise<any>,
                                              fingerprint: {name: string, version: string, sha: string},
                                              callback: (owner: string, repo: string, channel: string) => Promise<any>                                             
                                              ): Promise<any>
