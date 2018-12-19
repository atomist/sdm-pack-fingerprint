
/**
 * Types:  project Fingerprint types
 */
export declare interface FP {name: string, sha: string, data: any, version: string, abbreviation: string}
export declare interface Vote {ballot?: any, abstain: boolean, decision?: string, name?: string}
export declare interface VoteResults {
    failed: boolean,
    diff: Diff,
    failedFps: string[],
    successFps: string[]
}
export declare function voteResults(votes: Vote[]): VoteResults;

/**
 * Clojure fingerprint computations and editors
 */
export declare function depsFingerprints( f1:string ): Promise<FP[]>
export declare function logbackFingerprints( f1:string ): Promise<FP[]>
export declare function cljFunctionFingerprints( f1:string ): Promise<FP[]>
export declare function edit(f1:string,n:string,v:string): void
export declare function getFingerprintPreference(query: () => Promise<any> ,fpName:string): Promise<FP>
export declare function applyFingerprint(f1:string, fp: FP): Promise<any>
export declare function list(fps: any): string
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

/**
 * Fingerprint Push Impact support function - processPushImpact
 * (to rewrite in typescript someday)
 */
export declare interface DiffData {from: any[], to: any[]}
export declare interface Diff {from: FP, to: FP, data: DiffData, owner: string, repo: string, sha: string, providerId: string, channel: string}
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

/**
 * Library Dependency Goals Support functions
 * (to rewrite in typescript someday)
 */
// sendMessage about library targets from project which may contain lib dependencies (get library targets)
// we use this to check current library goals and possibly set some ones based on the current versions
export declare function withProjectGoals( queryPreferences: () => Promise<any>,
                                          basedir: string,
                                          sendMessage: (text: string,
                                                        options: {text: string, value: string}[],
                                                        ) => Promise<void>
                                          ): Promise<boolean>

// callback with library targets from project which may contain lib dependencies
export declare function withPreferences( queryPreferences: () => Promise<any>,
                                         callback: (options: {text: string, value: string}[]) => Promise<void>
                                         ): Promise<boolean>

// choose a new library target and set it in the team wide preferences
// we use this to set a new library goal
export declare function withNewGoal( queryPreferences: () => Promise<any>,
                                     mutatePreference: (prefName: string, chatTeamId: string, prefsAsJson: string) => Promise<any>,
                                     namespace: string,
                                     library: {name: string, version: string} | string
                                     ): Promise<boolean>
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



// choose a new library target and set it in the team wide preferences
// we use this to set a new library goal
export declare function withNewIgnore( queryPreferences: () => Promise<any>,
                                       mutatePreference: (chatTeamId: string, prefsAsJson: string) => Promise<any>,
                                       library: {owner: string, repo: string, name: string, version: string} | string
                                       ): Promise<boolean>


// send a message if any libraries in the updated project are not the target versions
// we use this to check whether a library is in sync with the current goals
export declare function checkLibraryGoals(queryPreferences: () => Promise<any>,
                                          sendMessage: (s: string, library: {library: {name: string, version: string}, current: string}) => Promise<any>,
                                          diff: Diff
                                          ): Promise<boolean>

// send a message if any project fingerprints are out of sync with the target state
export declare function checkFingerprintTargets(queryPreferences: () => Promise<any>,
                                                sendMessage: (s: string, fingerprint: FP) => Promise<Vote>,
                                                inSync: (fingerprint: FP) => Promise<Vote>,
                                                diff: Diff
                                                ): Promise<Vote>

// fire callbacks for all project consuming a library when a new library target is set
// we use this to broadcast a new library goal to all projects that might be impacted
export declare function broadcastFingerprint( queryFingerprints: (name: string) => Promise<any>,
                                              fingerprint: {name: string, version: string, sha: string},
                                              callback: (owner: string, repo: string, channel: string) => Promise<any>                                             
                                              ): Promise<any>

// fire callbacks for all project consuming a library when a new library target is set
// we use this to broadcast a new library goal to all projects that might be impacted
export declare function broadcast( queryFingerprints: (name: string) => Promise<any>,
                                   library: {name: string, version: string, fp: string},
                                   callback: (owner: string, repo: string, channel: string) => Promise<any>
                                   ): Promise<any>
