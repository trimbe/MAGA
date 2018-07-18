var twitter = require("twitter");
var fs = require("fs");
var request = require("request");
var async = require("async");
var Entities = require("html-entities").AllHtmlEntities;
var bigInt = require("big-integer");
var jsdiff = require("diff");
var config = require("./config");

const entities = new Entities();

var last_id_file = "last_id";

var last_id = fs.readFileSync(last_id_file, "utf8");

const client = new twitter({
	consumer_key: config.twitter.consumer_key,
	consumer_secret: config.twitter.consumer_secret,
	access_token_key: config.twitter.access_token_key,
	access_token_secret: config.twitter.access_token_secret
});


const checkInterval = setInterval(checkTweets, 2 * 60 * 1000);

const webhook = config.webhook;
const trumpUserId = "25073877";

function checkTweets() {
	client.get('statuses/user_timeline', { user_id: trumpUserId, count: 50, tweet_mode: "extended" }, function(error, tweets) {
		if(error) {
			console.log(error);
			return;
		}

		if(tweets.length == 0)
			return;

		var newTweets = [];
		var newestId = tweets[0].id_str;

		if(last_id == "") {
			last_id = newestId;
			fs.writeFileSync(last_id_file, newestId);
			return;
		}

		tweets.forEach(function(tweet, index) {
			if(bigInt(tweet.id_str).compare(last_id) == 1) {
				newTweets.push(tweet);
			}
		});

		// don't spam when script hasn't been running for some time
		if(newTweets.length > 5) {
			newTweets = [];
		}

		// we want to post these in chronological order, twitter returns newest first
		newTweets.reverse();
	
		var tweetsToPost = [];
		newTweets.forEach(function(newTweet) {
			console.log("New Tweet: " + newTweet.full_text + "\n ID: " + newTweet.id_str);
	
			tweetsToPost.push(newDiscordPost(entities.decode(newTweet.full_text), "Donald J. Trump"));			

			tweets.forEach(function(tweet) {
				// typo'd?
				if(bigInt(tweet.id_str).compare(newTweet.id_str) == -1 && levenshtein(tweet.full_text, newTweet.full_text) < 25) {
					var diff = jsdiff.diffWords(entities.decode(tweet.full_text), entities.decode(newTweet.full_text));
					var diffStr = "";
					diff.forEach(function(part) {
						if(part.added) {
							diffStr += "+(" + part.value.trim() + ") ";
						} else if (part.removed) {
							diffStr += "-(" + part.value.trim() + ") ";
						} else {
							diffStr += part.value + "";
						}
					});

					tweetsToPost.push(newDiscordPost("Typo detected: \n" + diffStr, "Donald J. Trump (TYPO)"))

					console.log("Found a typo: " + diffStr);
				}
			});
		});
	
		async.series(tweetsToPost);
	
		fs.writeFileSync(last_id_file, newestId);
		last_id = newestId;
	});	
}

const newDiscordPost = (message, username) => {
	return function(callback) {
		request.post(
			webhook,
			{
				json: {
					content: message,
					username: username,
					avatar_url: "https://pbs.twimg.com/profile_images/874276197357596672/kUuht00m_400x400.jpg"
				}
			},
			function(error, response, body) {
				callback();
			}
		);
	};
}

// https://gist.github.com/andrei-m/982927#gistcomment-1931258
const levenshtein = (a, b) => {
	if (a.length === 0) return b.length
	if (b.length === 0) return a.length
	let tmp, i, j, prev, val, row
	// swap to save some memory O(min(a,b)) instead of O(a)
	if (a.length > b.length) {
	  tmp = a
	  a = b
	  b = tmp
	}
  
	row = Array(a.length + 1)
	// init the row
	for (i = 0; i <= a.length; i++) {
	  row[i] = i
	}
  
	// fill in the rest
	for (i = 1; i <= b.length; i++) {
	  prev = i
	  for (j = 1; j <= a.length; j++) {
		if (b[i-1] === a[j-1]) {
		  val = row[j-1] // match
		} else {
		  val = Math.min(row[j-1] + 1, // substitution
				Math.min(prev + 1,     // insertion
						 row[j] + 1))  // deletion
		}
		row[j - 1] = prev
		prev = val
	  }
	  row[a.length] = prev
	}
	return row[a.length]
  }



