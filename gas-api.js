const querystring = require('querystring');
const https = require('https');
const crypto = require('crypto');

// for file cache
const fs = require('fs');
const path = require('path');

// for activating
const readline = require('readline');

function now() { return Math.floor(new Date().getTime() / 1000); }

function dummyAccessTokenCache(arg) { if (typeof arg === 'function') arg(); }

function fileAccessTokenCache(fileName) {
	var dir = path.dirname(fileName);
	try {
		fs.mkdirSync(dir);
	} catch (err) {
		if (err.code != 'EEXIST') {
			throw err;
		}
	}
	return function (arg) {
		switch (typeof arg) {
			case 'function':
				fs.readFile(fileName, function(err, content) {
					if (err && err.code != 'ENOENT') throw err;
					arg(content ? JSON.parse(content) : undefined);
				});
				break;
			case 'object':
				fs.writeFile(fileName, JSON.stringify(arg, null, 2), function (err) {
					if (err) throw err;
				});
				break;
		}
	};
}

function assertNotEmptyString(str, msg) {
	if (typeof str !== 'string' || str.length == 0) throw new Error(msg);
	return str;
}

function isAccessTokenValid(at, checkSum) {
	return at && typeof at === 'object'
	    && typeof at.access_token === 'string' && at.access_token
	    && at.token_type === "Bearer"
	    && typeof at.expires_at === 'number'
	    && at.expires_at > now()
		&& (!checkSum || at.check_sum === checkSum);
}

function GoogleAppsScriptAPI(auth) {
	if (!auth) auth = process.env.GOOGLE_AUTH;
	if (!auth) throw new Error("Missing authorization!\n" +
		"Provide it as argument or environment variable GOOGLE_AUTH.\n" +
		"Example: {client_id:'<client_id>',client_secret:'<client_secret>',refresh_token:'<refresh_token>'}");
	if (typeof auth == 'string') auth = process.env[auth] ? JSON.parse(process.env[auth]) : JSON.parse(auth);
	this.auhtorization = {
		client_id: assertNotEmptyString(auth.client_id, "authorization does not contains client_id"),
		client_secret: assertNotEmptyString(auth.client_secret, "authorization does not contains client_secret"),
		refresh_token: assertNotEmptyString(auth.refresh_token, "authorization does not contains refresh_token"),
		grant_type: 'refresh_token'
	};
	this.checkSum = crypto.createHash('sha256').update(auth.clientId + ':' + auth.refresh_token).digest('hex');
	this.accessTokenCache = dummyAccessTokenCache;
}

GoogleAppsScriptAPI.prototype.setAccessTokenCache = function (cache) {
	this.accessTokenCache = typeof cache === 'string' ? fileAccessTokenCache(cache) : cache;
};

GoogleAppsScriptAPI.prototype.getAccessToken = function (callback) {
	var me = this;
	if (isAccessTokenValid(me.accessToken, me.checkSum)) callback(null, me.accessToken);
	else me.accessTokenCache(function (accessToken) {
		if (isAccessTokenValid(accessToken, me.checkSum)) callback(null, me.accessToken = accessToken);
		else me.refreshAccessToken(function (err, accessToken) {
			if (err) callback(err, accessToken);
			else if (isAccessTokenValid(accessToken)) {
				accessToken.check_sum = me.checkSum;
				me.accessTokenCache(accessToken);
				callback(null, me.accessToken = accessToken);
			}
			else callback(accessToken);
		});
	});
};

/*
 Implemented according to: https://developers.google.com/identity/protocols/OAuth2InstalledApp#refresh
 */
GoogleAppsScriptAPI.prototype.refreshAccessToken = function (callback) {
	var time = now();
	var options = {
		hostname: 'www.googleapis.com',
		path: '/oauth2/v4/token',
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
	};
	var requestBody = querystring.stringify(this.auhtorization);
	var request = https.request(options, function (res) {
		//var contentType = res.headers['content-type'].split(/;\s*/g); //TODO
		res.setEncoding('utf8');
		res.on('data', function (chunk) {
			var result = JSON.parse(chunk);
			if (res.statusCode != 200) {
				callback({
					request: {
						url: 'https://' + options.hostname + options.path,
						method: options.method,
						headers: options.headers,
						body: requestBody
					},
					response: {
						code: res.statusCode,
						headers: res.headers,
						body: result
					}
				});
			}
			else {
				if (result.expires_in) result.expires_at = time + result.expires_in;
				callback(null, result);
			}
		});
	});
	request.on('error', callback);
	request.write(requestBody);
	request.end();
};

GoogleAppsScriptAPI.prototype.run = function (options, callback, line) {
	var me = this;
	me.getAccessToken(function (err, accessToken) {
		if (err) callback(err, accessToken);
		else {
			var request = https.request({
				hostname: 'script.googleapis.com',
				path: '/v1/scripts/' + options.scriptId + ':run',
				method: 'POST',
				headers: { Authorization: accessToken.token_type + ' ' + accessToken.access_token }
			}, function (res) {
				var err = res.statusCode != 200 ? new Error("Status code: " + res.statusCode) : null;
				//var contentType = res.headers['content-type'].split(/;\s*/g); //TODO
				res.setEncoding('utf8');
				res.on('data', function (chunk) {
					var response = JSON.parse(chunk);
					if (response.error) callback(response.error);
					else if (response.response) callback(err, response.response.result);
					else callback(response);
				});
			});
			request.on('error', callback);
			var requestBody = {function: options.function};
			if (options.parameters) requestBody.parameters = options.parameters;
			if (options.devMode) requestBody.devMode = options.devMode;
			request.write(JSON.stringify(requestBody));
			request.end();
		}
	});
};

function asQueryString(params) {
	var result = [];
	for (var key in params) result.push(encodeURIComponent(key)+'='+encodeURIComponent(params[key]));
	return result.join('&');
}

function exchangeAuthorization(requestBody, callback) {
	var request = https.request({
		hostname: 'www.googleapis.com',
		path: '/oauth2/v4/token',
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
	}, function (res) {
		var err = res.statusCode != 200 ? new Error("Status code: " + res.statusCode) : null;
		//var contentType = res.headers['content-type'].split(/;\s*/g); //TODO
		res.setEncoding('utf8');
		res.on('data', function (chunk) {
			var response = JSON.parse(chunk);
			if (!response.refresh_token) callback(response);
			else callback(err, response.refresh_token);
		});
	});
	request.on('error', callback);
	requestBody.redirect_uri = 'urn:ietf:wg:oauth:2.0:oob';
	requestBody.grant_type = 'authorization_code';
	request.write(querystring.stringify(requestBody));
	request.end();
}

function readLine(rl, prompt, defaultValue, callback) {
	rl.question(prompt + (defaultValue ? ' [\x1b[1m' + defaultValue + '\x1b[0m]: ' : ': '), function (answer) {
		if (answer) callback(answer);
		else if (defaultValue) callback(defaultValue);
		else readLine(rl, prompt, defaultValue, callback);
	});
}

// https://developers.google.com/apps-script/execution/rest/v1/scripts/run#authorization
var allScopes = {
	"https://mail.google.com/": ["View and manage your mail", "Zobrazenie a správa pošty"],
	"https://www.googleapis.com/auth/drive": ["View and manage the files in your Google Drive", "Zobrazovanie a správa súborov na Disku Google"],
	"https://www.googleapis.com/auth/userinfo.email": ["Know who you are on Google|View your email address", "Informácie o vás v službe Google|Zobrazenie e-mailovej adresy"],
	"https://www.google.com/calendar/feeds": ["Manage your calendars", "Správa kalendárov"],
	"https://www.googleapis.com/auth/spreadsheets": ["View and manage your spreadsheets in Google Drive", "Zobrazenie a správa tabuliek na Disku Google"],
	"https://www.googleapis.com/auth/spreadsheets.currentonly": ["View and manage spreadsheets that this application has been installed in", "Zobrazenie a správa tabuliek, v ktorých bola táto aplikácia nainštalovaná"],
	"https://sites.google.com/feeds": ["Manage your sites", "Správa webových stránok"],
	"https://www.google.com/m8/feeds": ["Manage your contacts", "Správa kontaktov"],
	"https://apps-apis.google.com/a/feeds": ["Manage users on your domain", "Správa používateľov na doméne"],
	"https://apps-apis.google.com/a/feeds/groups/": ["Manage groups on your domain", "Správa skupín v doméne"],
	"https://apps-apis.google.com/a/feeds/alias/": ["Manage the alias settings of users on your domain", "Správa nastavení aliasov používateľov v doméne"],
	"https://www.googleapis.com/auth/admin.directory.user": ["View and manage the provisioning of users on your domain", "Zobrazenie a správa poskytovania účtov používateľom v doméne"],
	"https://www.googleapis.com/auth/admin.directory.group": ["View and manage the provisioning of groups on your domain", "Zobrazenie skupín v doméne a správa ich poskytovania"],
	"https://www.googleapis.com/auth/groups": ["View and manage your Google Groups", "Zobrazenie a správa služby Skupiny Google"],
	"https://www.googleapis.com/auth/sqlservice": ["Manage the data in your Google SQL Service instances", "Správa údajov v inštanciách služby Google SQL Service"],
	"https://www.googleapis.com/auth/documents": ["View and manage your documents in Google Drive", "Zobrazenie a správa dokumentov v službe Disk Google"],
	"https://www.googleapis.com/auth/documents.currentonly": ["View and manage documents that this application has been installed in", "Zobrazenie a správa dokumentov, v ktorých bola táto aplikácia nainštalovaná"],
	"https://www.googleapis.com/auth/script.storage": ["View and manage data associated with the application", "Zobrazenie a správa údajov priradených k aplikácii"],
	"https://www.googleapis.com/auth/script.scriptapp": ["Allow this application to run when you are not present", "Povolenie činnosti tejto aplikácie v čase vašej neprítomnosti"],
	"https://www.googleapis.com/auth/script.cpanel": ["View and manage applications' settings for your domain", "Zobrazenie a správa nastavení aplikácií pre vašu doménu"],
	"https://www.googleapis.com/auth/script.send_mail": ["Send email as you", "Odosielanie e-mailov vo vašom mene"],
	"https://www.googleapis.com/auth/script.external_request": ["Connect to an external service", "Pripojenie k externej službe"],
	"https://www.googleapis.com/auth/script.webapp.deploy": ["Publish this application as a web app or a service that may share your data", "Publikovanie tejto aplikácie ako webovej aplikácie alebo služby, ktorá môže zdieľať vaše údaje"],
	"https://www.googleapis.com/auth/dynamiccreatives": ["View and manage profiles for your Rich Media dynamic creatives", "Zobrazenie a správa profilov pre multimediálne dynamické kreatívy"],
	"https://www.googleapis.com/auth/forms": ["View and manage your forms in Google Drive", "Zobrazenie a správa formulárov v službe Disk Google"],
	"https://www.googleapis.com/auth/forms.currentonly": ["View and manage forms that this application has been installed in", "Zobrazenie a správa formulárov, v ktorých bola táto aplikácia nainštalovaná"]
};
var scopesLang = { "-1":'url', "0":'en', "1":"sk" };

function choseScopes(rl, callback, chosen, lang) {
	if (!chosen) chosen = [];
	if (isNaN(lang)) lang = 0;

	var langs = [];
	for (var l in scopesLang) if (lang != l) langs.push('\x1b[1m'+scopesLang[l]+'\x1b[0m');
	var list = [ '\nList of account permissions (change format by enter ' + langs.join(' or ') + '):\n' ];
	var count = 0;
	var current = [];
	for (var p in allScopes) {
		count++;
		var selected = chosen.indexOf(p) >= 0;
		if (selected) current.push('\x1b[1m' + count + '\x1b[0m');
		list.push(count < 10 ? '   ' : '  ', '\x1b[1m', count, selected ? '. ' : '.\x1b[0m ', allScopes[p][lang]||p, selected ? '\x1b[0m\n' : '\n');
	}
	console.log(list.join(''));
	rl.question(chosen.length ? 'Add other permission if you like [' + current.join(',') + ']: ' : 'Choose at least one permission: ', function (result) {
		if (result) {
			var position = parseInt(result);
			if (!isNaN(position)) {
				var scopes = Object.keys(allScopes);
				if (position > 0 && position <= scopes.length) {
					var index = chosen.indexOf(scopes[position - 1]);
					if (index < 0) chosen.push(scopes[position - 1]);
					else {
						chosen.splice(index, 1);
						console.log('\x1b[31mWarning: Permission is unselected because it was already selected!\x1b[0m');
					}
				}
				else console.log('\x1b[31mWarning: given position is out of range!\x1b[0m');
			}
			else switch (result) {
				case 'sk': lang = 1; break;
				case 'en': lang = 0; break;
				case 'url': lang = -1; break;
				default: console.log('\x1b[31mWarning: unrecognized input!\x1b[0m');
			}
		}
		if (!result && chosen.length) callback(chosen);
		else choseScopes(rl, callback, chosen, lang);
	});
}

function exportToFile(file, line, macher) {
	fs.readFile(file, function(err, content) {
		if (err && err.code != 'ENOENT') throw err;
		else if (err) fs.writeFile(file, line+'\n', function (err) { if (err) throw err; });
		else {
			content = content.toString('utf8').split('\n');
			var i = 0;
			for (; i < content.length; i++) if (content[i].match(macher)) {
				content[i] = line;
				break;
			}
			if (i == content.length) {
				if (content[content.length - 1]) content.push(line, '');
				else content.splice(content.length - 1, 0, line);
			}
			fs.writeFile(file, content.join('\n'), function (err) { if (err) throw err; });
		}
	});
}

// inspired by: https://developers.google.com/apps-script/guides/rest/quickstart/nodejs
function createPermittedAuthorization() {
	var rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	var currentAuth = process.env.GOOGLE_AUTH;
	if (currentAuth) currentAuth = JSON.parse(currentAuth);
	readLine(rl, 'Client ID', currentAuth && currentAuth.client_id, function(clientId) {
		readLine(rl, 'Client secret', currentAuth && currentAuth.client_secret, function(clientSecret) {
			choseScopes(rl, function (scopes) {
				console.log('\nAuthorize this app by visiting this url: \x1b[1mhttps://accounts.google.com/o/oauth2/auth?' +
					asQueryString({
						access_type: 'offline',
						scope: scopes.join(" "),
						response_type: 'code',
						client_id: clientId,
						redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
					}) + '\x1b[0m');
				readLine(rl, '\nEnter the code from that page here', undefined, function(code) {
					rl.close();
					exchangeAuthorization({
						code: code,
						client_id: clientId ,
						client_secret: clientSecret
					}, function (err, refreshToken) {
						if (err) {
							if (err instanceof Error) console.log('\n\x1b[31;1m', err, '\x1b[0m');
							else console.log('\n\x1b[31;1mError: ', err, '\x1b[0m');
						}
						else {
							var auth = {
								client_id: clientId,
								client_secret: clientSecret,
								refresh_token: refreshToken
							};
							console.log('\nAuthorization was successful:\n' +
								'\x1b[1m' + JSON.stringify(auth, null, 2) + '\x1b[0m\n' +
								"export GOOGLE_AUTH='" + JSON.stringify(auth) + "'");
							exportToFile('.env', "export GOOGLE_AUTH='" + JSON.stringify(auth) + "'", /^\s*(export\s+)?GOOGLE_AUTH=/);
						}
					});
				});
			});
		});
	});
}

if (require.main === module) createPermittedAuthorization();
else module.exports = GoogleAppsScriptAPI;
