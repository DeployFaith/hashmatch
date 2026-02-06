/**
 * Sample Number Guess replay as a JSONL string constant.
 * Used by the "Load sample" button — no network requests needed.
 */
export const SAMPLE_JSONL = `\
{"seq":0,"matchId":"ng-demo-001","type":"MatchStarted","scenarioName":"NumberGuess","seed":42,"agentIds":["alice","bob"],"maxTurns":5,"engineVersion":"0.1.0"}
{"seq":1,"matchId":"ng-demo-001","type":"TurnStarted","turn":1}
{"seq":2,"matchId":"ng-demo-001","type":"ObservationEmitted","turn":1,"agentId":"alice","observation":{"range":[1,100],"hint":"Guess a number between 1 and 100"}}
{"seq":3,"matchId":"ng-demo-001","type":"ObservationEmitted","turn":1,"agentId":"bob","observation":{"range":[1,100],"hint":"Guess a number between 1 and 100"}}
{"seq":4,"matchId":"ng-demo-001","type":"ActionSubmitted","turn":1,"agentId":"alice","action":{"guess":50}}
{"seq":5,"matchId":"ng-demo-001","type":"ActionSubmitted","turn":1,"agentId":"bob","action":{"guess":75}}
{"seq":6,"matchId":"ng-demo-001","type":"ActionAdjudicated","turn":1,"agentId":"alice","valid":true,"feedback":"Too low"}
{"seq":7,"matchId":"ng-demo-001","type":"ActionAdjudicated","turn":1,"agentId":"bob","valid":true,"feedback":"Too high"}
{"seq":8,"matchId":"ng-demo-001","type":"StateUpdated","turn":1,"summary":{"secret":63,"guesses":{"alice":50,"bob":75}}}
{"seq":9,"matchId":"ng-demo-001","type":"TurnStarted","turn":2}
{"seq":10,"matchId":"ng-demo-001","type":"ObservationEmitted","turn":2,"agentId":"alice","observation":{"hint":"Too low","lastGuess":50}}
{"seq":11,"matchId":"ng-demo-001","type":"ObservationEmitted","turn":2,"agentId":"bob","observation":{"hint":"Too high","lastGuess":75}}
{"seq":12,"matchId":"ng-demo-001","type":"ActionSubmitted","turn":2,"agentId":"alice","action":{"guess":63}}
{"seq":13,"matchId":"ng-demo-001","type":"ActionSubmitted","turn":2,"agentId":"bob","action":{"guess":60}}
{"seq":14,"matchId":"ng-demo-001","type":"ActionAdjudicated","turn":2,"agentId":"alice","valid":true,"feedback":"Correct!"}
{"seq":15,"matchId":"ng-demo-001","type":"ActionAdjudicated","turn":2,"agentId":"bob","valid":true,"feedback":"Too low"}
{"seq":16,"matchId":"ng-demo-001","type":"StateUpdated","turn":2,"summary":{"secret":63,"guesses":{"alice":63,"bob":60},"winner":"alice"}}
{"seq":17,"matchId":"ng-demo-001","type":"MatchEnded","reason":"completed","scores":{"alice":1,"bob":0},"turns":2,"details":{"winner":"alice","winningTurn":2,"secret":63}}`;
