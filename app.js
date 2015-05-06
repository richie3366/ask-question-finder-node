var easymongo = require('easymongo'); // v3.2.0 ici
var jsdom     = require("jsdom");
var request   = require('request');

var mongo     = new easymongo({dbname: 'ask'});
var questions = mongo.collection('questions');

var memory    = {continueToLoad : true};

var express = require('express'); // v3.4.8 ici
var app = express(); 

ASK_CHANNEL = 'richie3366';
CHECK_EVERY = 30;
CHECK_START = true;

UPGRADE_ACCENTS = false; // enable it if you used this script before the ignore-accent update (v0.3.0)

app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
 });

app.get('/', function (req, res) {

	if(req.query && req.query.s){
		res.redirect('/#'+(encodeURIComponent(req.query.s)));
		res.end();
		return;
	}


	res.render('ask_index');
});

app.get('/search', function (req, res) {
	res.set('Content-Type', 'application/json; charset=UTF-8');

	if(req.query && req.query.q !== void(0) && typeof req.query.q === 'string' && req.query.q.length > 0){
		var s = {};
		var ope = ['$or', ' OR '];
		var q = stripAccents(req.query.q);
		req.query._regex = [];

		console.log('search', req.query.q);

		if(q.indexOf(" AND ") > -1 || q.indexOf(" OR ") > -1){
			if(q.indexOf(" AND ") > -1)
				ope = ['$and', ' AND '];
		}else{
			ope[1] = ',';
		}

		s[ope[0]] = [];
		var spl = q.split(ope[1]);

		for(var _i in spl){
			var curr;
			var searchSpec = false;

			if((spl[_i].toLowerCase().indexOf('$q:') === 0 || spl[_i].toLowerCase().indexOf('$a:') === 0) && spl[_i].length > 3){
				searchSpec = ((spl[_i].toLowerCase().substr(0, 3) === '$q:')?'questionstrip':'answerstrip');
				spl[_i] = spl[_i].substr(3);
			}

			try{
				curr = RegExp(spl[_i].trim().replace(/;/g, '(\\W|^|$)'), 'ig');
				req.query._regex.push(spl[_i].trim().replace(/;/g, ''));
			}catch(err){
				curr = RegExp(RegExp.quote(spl[_i].trim()).replace(/;/g, '(\\W|^|$)'), 'ig');
				req.query._regex.push(RegExp.quote(spl[_i].trim().replace(/;/g, '')));
			}

			if(searchSpec){
				sObj = {};
				sObj[searchSpec] = curr;
				s[ope[0]].push(sObj);
			}else{
				s[ope[0]].push({$or : [{questionstrip: curr}, {answerstrip: curr}]});
			}
		}

		questions.find(s, {sort: {askid: -1}}, function(err, rows){
			toRet = {search: req.query.q, regex: req.query._regex, results: rows};
			res.write(JSON.stringify(toRet));
			res.end();
		});
	}

});

if(UPGRADE_ACCENTS)
	questions.find({$or: [{questionstrip: {$exists: false}}, {answerstrip: {$exists: false}}]}, function(err, rows){
		for(_i in rows){
			rows[_i].questionstrip = stripAccents(rows[_i].question);
			rows[_i].answerstrip   = stripAccents(rows[_i].answer);
			questions.save(rows[_i]);
		}
	});


app.set('view engine', 'ejs');
app.listen(3016, 'localhost'); // en local only, parce que nginx qui bridge

RegExp.quote = function(str) {
    return (str+'').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
};

function stripAccents(str) {
    var reAccents = /[àáâãäçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ]/g;
    var replacements = 'aaaaaceeeeiiiinooooouuuuyyAAAAACEEEEIIIINOOOOOUUUUY';
    return str.replace(reAccents, function (match) {
        return replacements[reAccents.source.indexOf(match)];
    });
}

var contentLoaded = function(data){
    jsdom.env(data, ["http://code.jquery.com/jquery.js"],
        function (errors, window) {
            var $ = window.$;
            var _questions = $('div.questionBox');

            _questions.each(function(i, elem){
                var q        = $(elem);
                var askid    = parseInt(q.attr('id').replace('question_box_', ''), 10);
                var question = q.find('div.question > span > span').text().trim();
                var answer   = q.find('div.answer').html(q.find('div.answer').html().replace(/<div class=\"answer-paragraph\"><\/div>/gi, "\n\n").replace(/<br ?\/?>/gi, "\n")).text().trim();
                tryInsertQuestion(askid, question, answer);

                console.log(askid, question, answer);
            });

            window.close();
        }
    );
};

var emptyFunction = function(){};

var $ = function(){
    return {after : contentLoaded, val: function(page){setTimeout(getPage, 5000, page);}, hide: emptyFunction};
}

function tryInsertQuestion(askid, question, answer){
    questions.count({askid : askid}, function(err, cnt){
        if(!err && cnt === 0){
            var doc = {askid: askid, question: question, answer: answer, questionstrip: stripAccents(question), answerstrip: stripAccents(answer)};
            questions.save(doc);
        }else if(!err && cnt > 0)
            memory.continueToLoad = false;
    });
}

function getPage(page){
    if(!memory.continueToLoad) return;

    request({url:'http://ask.fm/'+ASK_CHANNEL+'/more?time=blabla&page='+page}, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            eval(body);
        }
    });
}

if(CHECK_START)
	getPage('0');

setInterval(function(){
	memory.continueToLoad = true;
	getPage('0');
}, CHECK_EVERY*60*1000);