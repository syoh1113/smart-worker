const puppeteer = require('puppeteer');
const fs = require('fs');
const request = require('request');
const convert = require('xml-js');

async function getWorkTime(configPath) {
    let result = null

    const jsonFile = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(jsonFile)

    const browser = await puppeteer.launch({headless:true}); // 브라우저 실행 (여기서 headless:false 속성을 주면 브라우저가 열리고 닫히는 과정을 시각적으로 볼 수 있다.
    const page = await browser.newPage(); // 새로운 페이지 열기
    await page.setViewport({
      width: 1920,
      height: 1080
    });
    // 지정된 URL 접속
    await page.goto(config.address, {waitUntil: 'networkidle2'});
    
    let loginBody = (await page.$('.login-col')) || "";
    if (loginBody == "") {
        console.log("로그인 페이지 탐색 실패")
    }
    else {
        let loginForm = (await page.$('.form-group')) || "";
        if (loginForm == "") {
            console.log("로그인 입력 창 탐색 실패")
        }
        else {
            await page.$eval('#loginUserId', (el, id) => el.value = id, config.account.id)
            await page.$eval('#loginUserPwd', (el, pwd) => el.value = pwd, config.account.pwd)
            await page.click('#btnLogin')
            await page.waitForNavigation({waitUntil: 'networkidle2'})
            await page.click('#leftMenuArea > li:nth-child(2) > button')
            await page.waitForSelector('#leftMenuArea > li.nav-item.active > ul > li:nth-child(2) > button')
            await page.waitForTimeout(500);
            await page.click('#leftMenuArea > li.nav-item.active > ul > li:nth-child(2) > button')
            await page.waitForSelector('#contentPlaceHolder > div.top-contents-row.row.col.management3-top-contents.plr-0 > div > div.controller-group.clx.padding-type2 > div > div > div.controller-box.ml-0')
            await page.waitForTimeout(500);

            // use manually trigger change event
            const selectElem = await page.$('#selectSearchDateType');
            const optionElem = await page.$('#selectSearchDateType > option:nth-child(2)')
            await page.evaluate((optionElem, selectElem) => {
                optionElem.selected = true;
                const event = new Event('change', {bubbles: true});
                selectElem.dispatchEvent(event);
            }, optionElem, selectElem);

            await page.click('#btnSearch');
            await page.waitForTimeout(3000);
            result = await page.$$eval('#userDayWorkHistoryGrid div.k-grid-content table tbody tr', rows => {
                return Array.from(rows, row=> {
                    const columns = row.querySelectorAll('td');
                    return Array.from(columns, column => column.innerText);
                })
            })
        }
    }
    await browser.close();
    return result
}

function checkNeedUpdate(f, today) {
    if (fs.existsSync(f) == false) {
        return true
    }

    const year = today.getFullYear().toString().padStart(4, '0');
    const month = (today.getMonth()+1).toString().padStart(2, '0');
    const date = (() => {
        const hour = today.getHours()
        let date = today.getDate()-1
        if (hour < 7) {
            date -= 1
        }
        return date.toString().padStart(2, '0')
    })();
    
    const jsonFile = fs.readFileSync(f, 'utf-8');
    let savedWorkTime = null
    try {
        savedWorkTime = JSON.parse(jsonFile)
    } catch (e) {
        return true
    }

    if (savedWorkTime.hasOwnProperty(year) == false) {
        return true 
    } else if (savedWorkTime[year].hasOwnProperty(month) == false) { 
        return true 
    } else if (savedWorkTime[year][month].hasOwnProperty(date) == false) {
        return true
    } else if ( (() => {
            for (let i = 1; i < date; i++) {
                if (savedWorkTime[year][month].hasOwnProperty(i.toString().padStart(2, '0')) == false) {
                    return true
                }
            }
            return false
        })()) {
        return true
    }

    return false
}

async function updateWorkTime(f, configPath) {
    const result = await getWorkTime(configPath)

    let savedWorkTime = null
    if (fs.existsSync(f) == true) {
        const jsonFile = fs.readFileSync(f, 'utf-8');
        try {
            savedWorkTime = JSON.parse(jsonFile)
        } catch (e) {
            savedWorkTime = null
        }
    }

    if (savedWorkTime == null) {
        savedWorkTime = {}
    }

    for (res of result) {
        const ymd = res[1].split('-')
        const workedTime = res[8]

        if (savedWorkTime.hasOwnProperty(ymd[0]) == false) {
            savedWorkTime[ymd[0]] = {}
        }
        if (savedWorkTime[ymd[0]].hasOwnProperty(ymd[1]) == false) {
            savedWorkTime[ymd[0]][ymd[1]] = {}
        }
        savedWorkTime[ymd[0]][ymd[1]][ymd[2]] = workedTime
    }

    fs.writeFileSync(f, JSON.stringify(savedWorkTime))
}

async function getHoliday(savedPath, configPath, today) {
    const jsonFile = fs.readFileSync(savedPath, 'utf-8');
    const savedWorkTime = JSON.parse(jsonFile);
    const holidayStr = "holidays"

    const year = today.getFullYear().toString().padStart(4, '0');
    const month = (today.getMonth()+1).toString().padStart(2, '0');

    if (savedWorkTime[year][month].hasOwnProperty(holidayStr) == false) {
        const jsonFile = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(jsonFile)

        const baseUrl = "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo?"
        const apiKey = config.openAPIKey
        const keyArg = `serviceKey=${apiKey}&solYear=${year}&solMonth=${month}`
        const targetUrl = baseUrl + keyArg
        
        const response = await (() => {return new Promise(function (resolve, reject) {
            request(targetUrl, function(err, res, body) {
                if (!err && res.statusCode == 200) {
                    resolve(body);
                }
                else {
                    reject(err);
                }
            })
        })})()

        const jsonRes = JSON.parse(convert.xml2json(response, {compact: true, spaces: 4}))

        let holidays = []
        for (let item of jsonRes.response.body.items.item) {
            const date = item.locdate._text
            const y = parseInt(date.substr(0, 4))
            const m = parseInt(date.substr(4, 2))
            const d = parseInt(date.substr(6, 2))
            const day = new Date(y, m-1, d).getDay()
            if (day != 0 && day != 6) {
                holidays.push(d)
            }
        }

        savedWorkTime[year][month][holidayStr] = holidays
        fs.writeFileSync(savedPath, JSON.stringify(savedWorkTime))
    }

    return Object.keys(savedWorkTime[year][month][holidayStr]).length
}

(async () => {
    const today = new Date();
    const savedPath = './savedWorkTime.json';
    const configPath = './config.json';

    // 크롤링을 이용하여 이번달 총 근무한 시간 가져오기
    if (checkNeedUpdate(savedPath, today)) {
        await updateWorkTime(savedPath, configPath);
    }

    // 이번달에 채워야 하는 시간 가져오기 (공휴일 고려 필요)
    const days = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
    const targetHours = Math.floor(40*(days/7))
    const holidays = await getHoliday(savedPath, configPath, today);
    const finalTargetHours = targetHours - 8*holidays

    const jsonFile = fs.readFileSync(savedPath, 'utf-8');
    const savedWorkTime = JSON.parse(jsonFile);
    const workedTimes = savedWorkTime[today.getFullYear()][(today.getMonth()+1).toString().padStart(2, '0')]

    const totalWorkedMinutes = (() => {
        let totalWorkedMinutes = 0

        for (let key in workedTimes) {
            if (key == "holidays") {
                continue
            }
            const workedTime = workedTimes[key]
            const workedHM = workedTime.split(':')

            totalWorkedMinutes += parseInt(workedHM[0]) * 60 + parseInt(workedHM[1])
        }

        return totalWorkedMinutes
    })()

    const remainMinutes = (finalTargetHours*60) - totalWorkedMinutes
    const remainDays = (() => {
        let noNeedToWorkDays = new Set()
        for (let key in workedTimes) {
            if (key == "holidays") {
                for (let d of workedTimes[key]) {
                    noNeedToWorkDays.add(d)
                }
                continue
            }
            noNeedToWorkDays.add(parseInt(key))
        }

        for (let d = 1; d <= days; d++) {
            const day = new Date(today.getFullYear(), today.getMonth(), d).getDay()
            if (day == 0 || day == 6) {
                noNeedToWorkDays.add(d)
            }
        }

        return days - noNeedToWorkDays.size
    })()

    console.log("남은 요일수:", remainDays)
    console.log("남은 근무시간:", parseInt(remainMinutes/60) + ":" + remainMinutes%60)

    const remainMinuteAvg = remainMinutes/remainDays
    console.log("평균 남은 일 평균 시간:", parseInt(remainMinuteAvg/60) + ":" + Math.ceil(remainMinuteAvg%60))
})()
