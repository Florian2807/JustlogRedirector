const http = require("http");
const got = require("got");
const express = require("express");
const request = require("request");

const config = require("./config.json");

const loggedChannels = {};
const app = express();

app.get("/instances", (req, res) => {
    console.log(`${date()} request: ${req.url}`);
    res.send(loggedChannels);
});

app.get("/domains", (req, res) => {
    console.log(`${date()} request: ${req.url}`);
    res.send(config.domains);
});

app.get("/channels", (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.send({
        channels: getAllChannels().sort((a, b) => a.name.localeCompare(b.name)),
    });
});

app.get("/favicon.ico", (req, res) => res.status(204));

app.get("/list", (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    const channel = /[?&/]channel[=/]([a-zA-Z_0-9]+)/.exec(
        req.originalUrl
    )?.[1];
    let justlogDomain = getUrlOfInstanceParam(req, res, req.path.substring(1).split("/"), channel);
    if (!justlogDomain) return;
    req.pipe(request(`${justlogDomain}${req.url}`)).pipe(res);
});

app.get("/*", async (req, res) => {
    res.type("text/plain");
    console.log(date(), req.url);
    const url = new URL(
        req.protocol + "://" + req.get("host") + req.originalUrl + (req.search ?? "")
    );

    const path = url.pathname.split("/");
    path.shift();
    if (/\/(channel|channelid)\/\w+\/?$/gm.test(url.pathname)) {
        await parseUrl(path, req, res);
    } else if (
        /\/(channel|channelid)\/\w+\/(user|userid)\/\w+\/?$/gm.test(
            url.pathname
        )
    ) {
        await parseUrl(path, req, res);
    } else if (
        /\/(channel|channelid)\/\w+\/random?$/gm.test(req.url) ||
        /\/(channel|channelid)\/\w+\/(user|userid)\/\w+\/random?$/gm.test(req.url) ||
        /\/(channel|channelid)\/\w+\/random?$/gm.test(req.url) ||
        /(channel|channelid)\/\w+\/\d+\/\d{1,2}/gm.test(req.url) ||
        /\/(channel|channelid)\/\w+\/(user|userid)\/\w+\/\d+\/\d{1,2}/gm.test(
            req.url
        )
    ) {
        // /channel/:channelName/:year/:month/:day
        requestChannel(path, req, res);
    } else {
        console.log('ASD')
        res.send("page not found").status(404);
    }
});

async function parseUrl(path, req, res) {
    if (!path[1]?.toLowerCase()) {
        res.send("could not load logs").status(404);
        return;
    }
    let justlogDomain = getUrlOfInstanceParam(req, res, path, path[1].toLowerCase());
    if (!justlogDomain) return;

    const requestUrl = `${justlogDomain}/${req.originalUrl}`;
    const redirectPath = new URL((await got(requestUrl, {
        retry: {limit: 2},
        throwHttpErrors: false,
        followRedirect: true
    })).redirectUrls[0])
        .pathname;
    return res.redirect(redirectPath + req.originalUrl.replace(/^[^?]*/, ''));
}

function requestChannel(path, req, res) {
    const channel = path[1]?.toLowerCase();

    if (!channel) {
        res.send("could not load logs").status(404);
        return;
    }

    let justlogDomain = getUrlOfInstanceParam(req, res, path, channel);
    if (!justlogDomain) return;
    const requestUrl = justlogDomain + req.originalUrl;
    req.pipe(request(requestUrl)).pipe(res);
    res.url = requestUrl;
}

function getUrlOfInstanceParam(req, res, path, channel) {
    let justlogDomain
    if (path[0] === "list") path[0] = "channel"
    let instanceParam = testInstanceParam(req.query.instance);
    if (!instanceParam?.error) {
        if (instanceParam.url === undefined) {
            justlogDomain = getJustlogsDomain(path[0].toLowerCase(), channel);
        } else {
            justlogDomain = instanceParam.url;
        }
    } else {
        res.send("could not load logs").status(404);
        return;
    }
    return justlogDomain
}


function testInstanceParam(instanceParam) {
    // TODO REGEX FOR THAT SHIT
    if (!instanceParam) return {error: false, url: undefined}
    if (Object.keys(config.domains).includes(instanceParam)) {
        return {error: false, url: config.domains[instanceParam]}
    } else {
        return {error: true, url: undefined};
    }
}

async function fetchLoggedChannels() {
    let allChannels = {};
    for (const justlogInstance in config.domains) {
        try {
            const body = await got(
                `${config.domains[justlogInstance]}/channels`, {
                    headers: {
                        "User-Agent": "Justlog-Channel-Lister/Florian_2807"
                    },
                    retry: {limit: 2}
                }
            ).json()
            if (JSON.stringify(body).startsWith('<html>')) {
                return console.log('html site detected')
            }
            const channels = body.channels
            allChannels[justlogInstance] = channels.map((i) => {
                if (
                    !Object.values(allChannels)
                        .flat()
                        .map((c) => {
                            return c?.name;
                        })
                        .includes(i.name)
                ) {
                    return {userID: i.userID, name: i.name};
                } else {
                    return undefined;
                }
            });
            loggedChannels[justlogInstance] = allChannels[
                justlogInstance
                ].filter((i) => i);
        } catch (e) {
            console.warn(`${date()} ${justlogInstance}: ${e}`)
        }
    }
}

function getJustlogsDomain(source, channel) {
    if (source === "channel") {
        const justlogInstance = Object.keys(config.domains).find(
            (justlogInstance) =>
                loggedChannels[justlogInstance]
                    ?.map((c) => c.name)
                    .includes(channel)
        );
        return config.domains[justlogInstance];
    } else if (source === "channelid") {
        const justlogInstance = Object.keys(config.domains).find(
            (justlogInstance) =>
                loggedChannels[justlogInstance]
                    ?.map((c) => c.userID)
                    .includes(channel)
        );
        return config.domains[justlogInstance];
    }
}

function getAllChannels() {
    let allChannels = [];
    Object.keys(loggedChannels).forEach((instances) => {
        loggedChannels[instances].forEach((channel) => {
            allChannels.push(channel);
        });
    });
    return allChannels;
}

function date() {
    return new Intl.DateTimeFormat("de-de", {
        dateStyle: "medium",
        timeStyle: "medium",
    }).format(new Date());
}

setInterval(async () => {
    await fetchLoggedChannels();
}, 600000);


const server = http.createServer(app);

server.listen(config.port, async () => {
    console.log(`${date()}: Server listening on port ${config.port}`);

    await fetchLoggedChannels();
});
