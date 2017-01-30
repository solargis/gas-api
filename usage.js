
var GoogleAppsScriptAPI = require('./gas-api.js');

function getEnv(envName) {
	var result = process.env[envName];
	if (!result) throw new Error("Missing environement variable: " + envName);
	return result;
}

var scriptId = getEnv('GOOGLE_SCRIPT_ID');

var gscript = new GoogleAppsScriptAPI();  // let GoogleAppsScriptAPI reads env GOOGLE_AUTH
//... or pass different valid env VARIABLE
//var gscript = new GoogleAppsScriptAPI('OTHER');
//... or direct pass authorization data
//var gscript = new GoogleAppsScriptAPI(getEnv('GOOGLE_AUTH'));
//var gscript = new GoogleAppsScriptAPI("{client_id:'<client_id>',client_secret:'<client_secret>',refresh_token:'<refresh_token>'}");
//var gscript = new GoogleAppsScriptAPI({client_id:'<client_id>',client_secret:'<client_secret>',refresh_token:'<refresh_token>'});

gscript.setAccessTokenCache(".auth/access-token.json");
//... or you can implement custom cache provider
/*gscript.setAccessTokenCache(function (arg) {
	if (typeof arg === 'function') arg(JSON.parse('<ret value from cache>'));
	else if (typeof arg === 'object') <write value to cache> = JSON.stringify(arg);
});//*/

gscript.run({
	scriptId: scriptId,
	function: 'insertRow',
	parameters: [[process.env.USER, new Date().getMinutes(), '=YEAR(NOW())-R[0]C[-1]']],
	devMode: true
}, function (err, response) {
	if (err) {
		if (err instanceof Error) {
			console.log(err);
			if (response) console.log(JSON.stringify(response, null, 2));
		}
		else console.log("Error: " + JSON.stringify(err, null, 2));
	}
	else console.log(response);
});

