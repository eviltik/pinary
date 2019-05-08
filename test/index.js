const klawSync = require('klaw-sync');
const path = require('path');
const async = require('async');
const spawn = require('child_process').spawn;

const tests = {};

let testName;
let dir;

function prepareTests() {
    let file;
    for (file of klawSync(__dirname, { depthLimit:1, nodir:true })) {

        if (!file.path.match(/[0-9]{3}/)) {
            continue;
        }

        testName = path.basename(file.path).replace(/\.js/, '');
        dir = path.dirname(file.path).split('/');
        dir = dir[dir.length-1];
        testName = dir+'/'+testName;
        tests[testName] = file.path;
        console.log(`Test registered (${testName})`);
    }
}

function runTests(done) {

    prepareTests();

    async.mapSeries(
        tests,
        (test, next) => {

            const args = [
                path.resolve('./node_modules/tape/bin/tape'),
                test
            ];

            const env = JSON.parse(JSON.stringify(process.env));
            env.TAPE_TEST = true;
            const opts = {
                stdio:'inherit',
                env
            };

            const s = spawn('node', args, opts);

            s.on('close', (code) => {
                if (code != 0) {
                    process.exit(255);
                }
                next();
            });

            s.on('error', (err) => {
                console.log(err);
                process.exit(255);
            });
        },
        done
    );
}

async.series([
    runTests
], () => {
    process.exit();
});
