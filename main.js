const puppeteer = require('puppeteer');
const fs = require('fs');

async function getWorkTime() {
    let result = null

    const jsonFile = fs.readFileSync('./config.json', 'utf-8');
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
            await page.waitForTimeout(1000);
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
    } else if (Object.keys(savedWorkTime[year][month]).length != date) {
        return true
    }

    return false
}

async function updateWorkTime(f) {
    const result = await getWorkTime()

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

(async () => {
    const today = new Date();
    const savedPath = './savedWorkTime.json'

    if (checkNeedUpdate(savedPath, today)) {
        await updateWorkTime(savedPath)
    }
})()

/*
    let minutes = 0
    for (res of result) {
        let time = res[8].split(':')
        console.log(res[1], res[8])
        minutes += (Number(time[0]) * 60 + Number(time[1]))
    }
    console.log('총 근무시간:', parseInt(minutes / 60) + ":" + minutes % 60)
*/
