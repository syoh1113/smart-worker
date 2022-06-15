// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

const puppeteer = require('puppeteer');
const request = require('request');
const convert = require('xml-js');
const fs = require('fs');
const { start } = require('repl');

const openAPIKeyStr = "openAPIKey"
const holidayStr = "holidays"
const addressUri = "addressURL"
const addressId = "addressID"

const configPath = "./config.json"
const workedPath = "./worked.json"
const planPath = "./plan.json"

{
    for (let path of [configPath, workedPath, planPath]) {
        if (fs.existsSync(path) == false) {
            const configSkeleton = {}
            fs.writeFileSync(path, JSON.stringify(configSkeleton));
        }
    }

    // 이번년도 및 이번달 구해서 HTML에 반영
    const dt = new Date()
    const thisYear = dt.getFullYear()
    const thisMonth = dt.getMonth() + 1
    document.getElementById("this_year").innerText = thisYear
    document.getElementById("this_month").innerText = thisMonth

    // 이번달 달력 일 채워넣기
    const daysCnt = new Date(thisYear, thisMonth, 0).getDate()
    const startDay = new Date(thisYear, thisMonth-1, 1).getDay()
    let calendarUl = document.querySelector("body > div > div.calendar > ul.days")
    for (let i = 0; i < startDay; i++) {
        calendarUl.appendChild(document.createElement("li"))
    }
    for (let i = 1; i <= daysCnt; i++) {
        let li = document.createElement("li")
        let p = document.createElement("p")
        let date = document.createElement("div")
        let day = (startDay + (i-1)) % 7
        const refDate = (() => {
            let date = dt.getDate()
            if (dt.getHours() < 7) {
                date -= 1
            }
            return date
        })()
        const canPlan = i >= refDate && (day != 0 && day != 6)
        if (canPlan) {
            let checkBox = document.createElement("INPUT")
            checkBox.setAttribute("type", "checkbox")
            checkBox.setAttribute("id", "planSet")
            date.appendChild(checkBox)
        }
        date.appendChild(document.createTextNode(i))
        if (day == 0) {
            date.setAttribute("style", "color:red")
        }
        else if (day == 6) {
            date.setAttribute("style", "color:blue")
        }
        p.appendChild(date)
        if (canPlan) {
            let planFlag = document.createElement("span")
            planFlag.appendChild(document.createTextNode("[미정]"))
            planFlag.setAttribute("id", "planFlag")
            p.appendChild(planFlag)
        }
        else {
            p.appendChild(document.createElement("br"))
        }
        let startTime = document.createElement("div")
        startTime.setAttribute("id", "startTime")
        startTime.appendChild(document.createTextNode("출근 00:00"))
        p.appendChild(startTime)
        let endTime = document.createElement("div")
        endTime.setAttribute("id", "endTime")
        endTime.appendChild(document.createTextNode("퇴근 00:00"))
        p.appendChild(endTime)
        let workedTime = document.createElement("div")
        workedTime.setAttribute("id", "workedTime")
        workedTime.appendChild(document.createTextNode("근무시간 00:00"))
        p.appendChild(workedTime)
        if (i == refDate) {
            p.setAttribute("class", "active")
        }
        li.appendChild(p)
        calendarUl.appendChild(li)
    }
    document.querySelector("#total_worked_time").innerText = "00:00"
    document.querySelector("#planed_work_time").innerText = "00:00"

    const targetHours = Math.floor(40*(daysCnt/7))
    document.querySelector("#target_total_work_time").innerText = targetHours+":00"
    document.querySelector("#total_work_time_remained").innerText = targetHours+":00"
    document.querySelector("#total_work_time_remained_with_plan").innerText = targetHours+":00"

    let config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) || {}
    let savedData = JSON.parse(fs.readFileSync(workedPath, 'utf-8')) || {}

    updateHolidaysToCalendar(savedData, dt)
    updateWorkedTimeToCalendar(savedData, dt)

    document.querySelector("#getHolidaysText").value = config[openAPIKeyStr] || ""
    
    document.querySelector("#addressURLText").value = config[addressUri] || ""
    document.querySelector("#addressIdText").value = config[addressId] || ""

    document.getElementById("getHolidaysBtn").addEventListener("click", ()=>{
        getHoliday(savedData, config, dt).then((cnt => {updateHolidaysToCalendar(savedData, dt)}))
    })

    document.querySelector("#getWorkedTimeBtn").addEventListener('click', ()=>{
        const year = dt.getFullYear().toString().padStart(4, '0');
        const month = (dt.getMonth()+1).toString().padStart(2, '0');
        if (savedData.hasOwnProperty(year) == false || savedData[year].hasOwnProperty(month) == false || savedData[year][month].hasOwnProperty(holidayStr) == false) {
            printConsoleLog("먼저 공휴일 정보를 가져오세요.")
            return
        }
        getWorkedTime(savedData, config, dt).then(() => {updateWorkedTimeToCalendar(savedData, dt)})
    })

    let consoleLog = document.querySelector("body > div > div.withPrintConsole > div")
    function printConsoleLog(str) {
        consoleLog.innerText = str
    }

    document.getElementById("clearPrintConsole").addEventListener("click", ()=>{
        consoleLog.innerText = ""
    })
   
    async function getHoliday(savedData, config, today) {
        const year = today.getFullYear().toString().padStart(4, '0');
        const month = (today.getMonth()+1).toString().padStart(2, '0');

        if (savedData.hasOwnProperty(year) == false) {
            savedData[year] = {}
        }
        if (savedData[year].hasOwnProperty(month) == false) {
            savedData[year][month] = {}
        }

        
        if (savedData[year][month].hasOwnProperty(holidayStr) == false) {
            const baseUrl = "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo?"
            const apiKey = document.querySelector("#getHolidaysText").value;
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
            
            if (jsonRes.hasOwnProperty('OpenAPI_ServiceResponse') == true) {
                if (jsonRes.OpenAPI_ServiceResponse.cmmMsgHeader.returnAuthMsg._text == 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR') {
                    printConsoleLog("해당 OPEN API 키는 유효하지 않습니다. 다른 키를 사용하세요.")
                    return null
                }
                else {
                    printConsoleLog("아직 처리되지 않은 에러 상황입니다. 관리자에게 문의하세요.")
                    return null
                }
            }

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

            savedData[year][month][holidayStr] = holidays
            fs.writeFileSync(workedPath, JSON.stringify(savedData))
            config[openAPIKeyStr] = apiKey
            fs.writeFileSync(configPath, JSON.stringify(config))
            printConsoleLog("이번달 공휴일 적용 성공")
        }
        else {
            printConsoleLog("이번달 공휴일은 이미 적용되어있습니다.")
        }

        return Object.keys(savedData[year][month][holidayStr]).length || 0
    }

    function updateHolidaysToCalendar(savedData, today) {
        const year = today.getFullYear().toString().padStart(4, '0');
        const month = (today.getMonth()+1).toString().padStart(2, '0');

        if ((savedData.hasOwnProperty(year) && savedData[year].hasOwnProperty(month) && savedData[year][month].hasOwnProperty(holidayStr)) == false) {
            return
        }

        let calendarUl = document.querySelector("body > div > div.calendar > ul.days")
        const holidays = savedData[year][month][holidayStr] || null
        for (let day of holidays) {
            for (let itemi = 0; itemi < calendarUl.childNodes.length; itemi++) {
                if (calendarUl.childNodes[itemi].childNodes.length == 0) {
                    continue
                }
                if (calendarUl.childNodes[itemi].querySelector("div").textContent == day) {
                    calendarUl.childNodes[itemi].querySelector("div").setAttribute('style', 'color:red')
                }
            }
        }

        const targetHours = Math.floor(40*(new Date(thisYear, thisMonth, 0).getDate()/7))
        document.querySelector("#target_total_work_time").innerText = (targetHours-8*holidays.length)+":00"
        document.querySelector("#total_work_time_remained_with_plan").innerText = (targetHours-8*holidays.length)+":00"
    }

    async function getWorkedTime(savedData, config, today) {
        const year = today.getFullYear().toString().padStart(4, '0');
        const month = (today.getMonth()+1).toString().padStart(2, '0');

        if (savedData.hasOwnProperty(year) == false) {
            savedData[year] = {}
        }
        if (savedData[year].hasOwnProperty(month) == false) {
            savedData[month] = {}
        }

        const date = (() => {
            const hour = today.getHours()
            let date = today.getDate()-1
            if (hour < 7) {
                date -= 1
            }
            return date.toString().padStart(2, '0')
        })();

        if (savedData[year][month].hasOwnProperty(date) == true) {
            const allDateExist = (() => {
                for (let i = 1; i < date; i++) {
                    if (savedData[year][month].hasOwnProperty(i.toString().padStart(2, '0')) == false) {
                        return false
                    }
                }
                return true
            })()

            if (allDateExist == true) {
                printConsoleLog("이미 서버로부터 모든 근무 시간을 가져왔습니다.")
                return
            }
        }

        // 브라우저 실행 (여기서 headless:false 속성을 주면 브라우저가 열리고 닫히는 과정을 시각적으로 볼 수 있다.
        printConsoleLog("근무시간 가져오기 시작")
        const isDebug = !(document.querySelector("#checkDebugWorkServer").checked)
        const browser = await puppeteer.launch({executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:isDebug});
        const page = await browser.newPage(); // 새로운 페이지 열기
        
        // 지정된 URL 접속
        printConsoleLog("근무시간 페이지 여는 중...")
        const url = document.querySelector("#addressURLText").value
        try {
            await page.goto(url, {waitUntil: 'networkidle2'})
        } catch (err) {
            errOccured = true
            const errHasMessage = err.hasOwnProperty('message')
            const isProtocolError = err.hasOwnProperty('name') && err.name == 'ProtocolError' && errHasMessage && err.message == 'Protocol error (Page.navigate): Cannot navigate to invalid URL'
            const isResolvedError = errHasMessage && err.message.indexOf("ERR_NAME_NOT_RESOLVED") != -1
            
            if (isProtocolError || isResolvedError) {
                printConsoleLog("유효하지 않은 url 입니다. 유효한 url 값을 입력하세요.")
            }
            else {
                printConsoleLog(err)
            }
            await browser.close()
            return
        }
        
        // first recreate waitForSelector
        const awaitSelector = async (selector) => {
            let timeoutCnt = 10
            return await new Promise((resolve, reject) => {
                const selectorInterval = setInterval(() => {
                    if ($(selector).is(':visible')) {
                        console.log(`${selector} visible`);
                        resolve();
                        clearInterval(selectorInterval);
                    };
                    timeoutCnt--
                    if (timeoutCnt < 1) {
                        reject();
                    }
                }, 1000);
            });
        }

        try {
            await page.evaluate('(' + awaitSelector.toString() + ')(".form-group");')
        } catch (err) {
            printConsoleLog("로그인 입력 창 탐색 실패")
            await browser.close()
            return
        }

        printConsoleLog("근무시간 페이지 로그인 중...")
        const account_id = document.querySelector("#addressIdText").value
        const account_password = document.querySelector("#addressPasswordText").value
        await page.evaluate('document.querySelector("#loginUserId").value = "' + account_id + '"' )
        await page.evaluate('document.querySelector("#loginUserPwd").value = "' + account_password + '"' )

        try {
            await Promise.all([
                page.waitForNavigation({timeout: 3000}),
                page.evaluate("document.querySelector('#btnLogin').click()")
            ])
        }
        catch (err) {
            console.log(err)
            printConsoleLog("로그인 실패하였습니다. id와 password가 유효한지 확인하세요")
            await browser.close()
            return
        }
        
        try {
            printConsoleLog("근무시간 페이지 내 관련 페이지로 이동 중...")
            let target = '#leftMenuArea > li:nth-child(2) > button'
            await page.evaluate('(' + awaitSelector.toString() + ')("'+ target + '");')
            await page.evaluate("document.querySelector('" + target + "').click()")
            target = '#leftMenuArea > li.nav-item.active > ul > li:nth-child(2) > button'
            await page.evaluate('(' + awaitSelector.toString() + ')("'+ target + '");')
            await page.waitForTimeout(500);
            target = '#leftMenuArea > li.nav-item.active > ul > li:nth-child(2) > button'
            await page.evaluate("document.querySelector('" + target + "').click()")
            target = '#contentPlaceHolder > div.top-contents-row.row.col.management3-top-contents.plr-0 > div > div.controller-group.clx.padding-type2 > div > div > div.controller-box.ml-0'
            await page.evaluate('(' + awaitSelector.toString() + ')("'+ target + '");')
            await page.waitForTimeout(500);

            const queriesSearchTables = ['selectElem = document.querySelector("#selectSearchDateType")',
                'optionElem = document.querySelector("#selectSearchDateType > option:nth-child(2)")',
                'optionElem.selected = true',
                'const event = new Event("change", {bubbles: true})',
                'selectElem.dispatchEvent(event)'
            ]
            for (let query of queriesSearchTables) {
                await page.evaluate(query)
            }

            await page.evaluate('document.querySelector("#btnSearch").click()');
            printConsoleLog("근무시간 페이지 내 근무시간 로딩 대기 중...")
            await page.waitForTimeout(3000);

            await page.evaluate('rawData = document.querySelectorAll("#userDayWorkHistoryGrid div.k-grid-content table tbody tr")')
            
            const rawDataLen = await page.evaluate('rawData.length')
            let result = []
            for (let i = 0; i < rawDataLen; i++) {
                const data = await page.evaluate('rawData['+ i +'].innerText')
                result.push(data.split('\t'))
            }
            
            printConsoleLog("근무시간 가져오기 성공")
            for (let res of result) {
                const ymd = res[1].split('-')
                const startTime = res[4]
                const endTime = res[5]
                const workedTime = res[8]

                if (savedData.hasOwnProperty(ymd[0]) == false) {
                    savedData[ymd[0]] = {}
                }
                if (savedData[ymd[0]].hasOwnProperty(ymd[1]) == false) {
                    savedData[ymd[0]][ymd[1]] = {}
                }
                if (savedData[ymd[0]][ymd[1]].hasOwnProperty(ymd[2]) == false) {
                    savedData[ymd[0]][ymd[1]][ymd[2]] = {'start': "0:00", 'end': "0:00", 'workedTime': "0:00"}
                }
                savedData[ymd[0]][ymd[1]][ymd[2]]['start'] = startTime
                savedData[ymd[0]][ymd[1]][ymd[2]]['end'] = endTime
                savedData[ymd[0]][ymd[1]][ymd[2]]['workedTime'] = workedTime
            }

            config[addressUri] = url
            config[addressId] = account_id
            fs.writeFileSync(configPath, JSON.stringify(config))
            fs.writeFileSync(workedPath, JSON.stringify(savedData))
        } catch (err) {
            console.log(err)
            printConsoleLog("로그인 후 정보를 가져오는 데 실패했습니다. 좀더 자세한 원인 파악이 필요합니다.")
            await page.waitForTimeout(1000000)
            await browser.close()
        }

        await browser.close()
    }

    function updateWorkedTimeToCalendar(savedData, today) {
        const year = today.getFullYear().toString().padStart(4, '0');
        const month = (today.getMonth()+1).toString().padStart(2, '0');

        if ((savedData.hasOwnProperty(year) && savedData[year].hasOwnProperty(month)) == false) {
            return
        }

        let calendarUl = document.querySelector("body > div > div.calendar > ul.days")
        const workedTimes = savedData[year][month] || null
        let workedMinutes = 0
        for (let i in workedTimes) {
            if (i == holidayStr) {
                continue
            }
            
            for (let itemi = 0; itemi < calendarUl.childNodes.length; itemi++) {
                if (calendarUl.childNodes[itemi].childNodes.length == 0) {
                    continue
                }
                if (calendarUl.childNodes[itemi].querySelector("div").textContent == Number(i)) {
                    let pChildren = calendarUl.childNodes[itemi].querySelector("p")
                    
                    let startTime = pChildren.querySelector("#startTime")
                    let endTime = pChildren.querySelector("#endTime")
                    let workedTime = pChildren.querySelector("#workedTime")

                    startTime.innerText = "출근 " + workedTimes[i]['start']
                    endTime.innerText = "퇴근 " + workedTimes[i]['end']
                    workedTime.innerText = "근무시간 " + workedTimes[i]['workedTime']
                    workedMinutes += (() => {
                        let splited = workedTimes[i]['workedTime'].split(':')
                        return Number(splited[0])*60 + Number(splited[1])
                    })()
                }
            }
        }
        document.querySelector("#total_worked_time").innerText = parseInt(workedMinutes / 60) + ":" + workedMinutes % 60
        const targetMinutes = Number(document.querySelector("#target_total_work_time").innerText.split(':')[0]) * 60
        const remainMinutes = targetMinutes - workedMinutes
        document.querySelector("#total_work_time_remained").innerText = parseInt(remainMinutes / 60) + ":" + remainMinutes % 60
        document.querySelector("#total_work_time_remained_with_plan").innerText = parseInt(remainMinutes / 60) + ":" + remainMinutes % 60

        const daysCnt = new Date(thisYear, thisMonth, 0).getDate()
        const startDate = (() => {
            const dt = new Date()
            if (dt.getHours() < 7) {
                return dt.getDate() - 1
            }
            return dt.getDate()
        })()
        let remainWorkedDay = 0
        for (let i = startDate; i <= daysCnt; i++) {
            for (let itemi = 0; itemi < calendarUl.childNodes.length; itemi++) {
                if (calendarUl.childNodes[itemi].childNodes.length == 0) {
                    continue
                }
                if (calendarUl.childNodes[itemi].querySelector("div").textContent == Number(i)) {
                    const style = calendarUl.childNodes[itemi].querySelector("div").getAttribute('style')
                    if (style == 'color:blue' || style == 'color:red') {
                        remainWorkedDay--
                    }
                }
            }
            remainWorkedDay++
        }
        document.querySelector("#total_day_count_remained").innerText = remainWorkedDay
        document.querySelector("#total_day_count_remained_with_plan").innerText = remainWorkedDay
        const remainAvgMinutes = remainMinutes / remainWorkedDay
        document.querySelector("#avg_work_time_remained").innerText = parseInt(remainAvgMinutes / 60).toString().padStart(2, '0') + ":" + parseInt(remainAvgMinutes % 60).toString().padStart(2, '0')
        document.querySelector("#avg_work_time_remained_with_plan").innerText = parseInt(remainAvgMinutes / 60).toString().padStart(2, '0') + ":" + parseInt(remainAvgMinutes % 60).toString().padStart(2, '0')
    }

    document.querySelector("#selectPlanCheckBtn").addEventListener('click', ()=>{
        let startDate = document.querySelector("body > div > div.control > input[type=number]:nth-child(14)").value
        let endDate = document.querySelector("body > div > div.control > input[type=number]:nth-child(15)").value

        if (startDate == "" || endDate == "") {
            printConsoleLog("시작일 또는 종료일이 비어있습니다.")
            return
        }

        const dt = new Date()
        const td = dt.getDate()
        if (startDate < td) {
            startDate = td
        }
        if (endDate < startDate) {
            endDate = startDate
        }
        
        const thisYear = dt.getFullYear()
        const thisMonth = dt.getMonth() + 1
        const maxDate = new Date(thisYear, thisMonth, 0).getDate()
        if (endDate > maxDate) {
            endDate = maxDate
        }
        if (startDate > endDate) {
            startDate = endDate
        }

        document.querySelector("body > div > div.control > input[type=number]:nth-child(14)").value = startDate
        document.querySelector("body > div > div.control > input[type=number]:nth-child(15)").value = endDate

        let calendarUl = document.querySelector("body > div > div.calendar > ul.days")
        for (let itemi = 0; itemi < calendarUl.childNodes.length; itemi++) {
            if (calendarUl.childNodes[itemi].childNodes.length == 0) {
                continue
            }
            let divNode = calendarUl.childNodes[itemi].querySelector("div")
            let calendarDate = Number(divNode.textContent)
            if (calendarDate >= startDate && calendarDate <= endDate) {
                let planSetNode = divNode.querySelector("#planSet")
                if (planSetNode == null) {
                    continue
                }
                planSetNode.value = true
                planSetNode.checked = true
            }
        }
    })

    document.querySelector("#selectAllPlanCheckBtn").addEventListener('click', ()=>{
        let calendarUl = document.querySelector("body > div > div.calendar > ul.days")
        let nodesWithChkBox = calendarUl.querySelectorAll("#planSet")

        for (let n of nodesWithChkBox) {
            n.value = true
            n.checked = true
        }
    })

    document.querySelector("#clearAllPlanCheckBtn").addEventListener('click', ()=>{
        let calendarUl = document.querySelector("body > div > div.calendar > ul.days")
        let nodesWithChkBox = calendarUl.querySelectorAll("#planSet")

        for (let n of nodesWithChkBox) {
            n.value = false
            n.checked = false
        }
    })

    document.querySelector("#applyPlanBtn").addEventListener('click', ()=>{
        const year = dt.getFullYear().toString().padStart(4, '0');
        const month = (dt.getMonth()+1).toString().padStart(2, '0');
        if (savedData.hasOwnProperty(year) == false || savedData[year].hasOwnProperty(month) == false || savedData[year][month].hasOwnProperty(holidayStr) == false) {
            printConsoleLog("먼저 공휴일 정보를 가져오세요.")
            return
        }

        const date = (() => {
            const hour = dt.getHours()
            let date = dt.getDate()-1
            if (hour < 7) {
                date -= 1
            }
            return date.toString().padStart(2, '0')
        })();

        if (savedData[year][month].hasOwnProperty(date) == false) {
            printConsoleLog("먼저 근무시간 정보를 가져오세요.")
            return
        }

        const workType = document.querySelector("body > div > div.control > input[type=radio]:checked").value
        console.log(workType)

        setData = {}
        if (workType == '8H') {
            setData['pF'] = "[연차]"
            setData['sT'] = "22:00"
            setData['eT'] = "22:00"
            setData['wT'] = "08:00"
        }
        else {
            setData['pF'] = "[정상근무]"
            const minTime = [7, 0]
            const maxTime = [22, 0]
            const coreHour = [10, 15]

            let startTime = document.querySelector("#startTime").value.split(":").map(x => Number(x))
            let endTime = document.querySelector("#endTime").value.split(":").map(x => Number(x))
            
            if (startTime[0] * 60 + startTime[1] < minTime[0] * 60 + minTime[1]) {
                startTime[0] = minTime[0]
                startTime[1] = minTime[1]
            }
            if (startTime[0] * 60 + startTime[1] > coreHour[0] * 60) {
                startTime[0] = coreHour[0]
                startTime[1] = 0
            }
            if (endTime[0] * 60 + endTime[1] > maxTime[0] * 60 + maxTime[1]) {
                endTime[0] = maxTime[0]
                endTime[1] = maxTime[1]
            }
            if (endTime[0] * 60 + endTime[1] < coreHour[1] * 60) {
                endTime[0] = coreHour[1]
                endTime[1] = 0
            }

            let addTime = [-1, 0]
            switch (workType) {
                case '4H_AM':
                    setData['pF'] = "[오전반차]"
                    startTime = [13, 0]
                    addTime = [4, 0]
                    break
                case '4H_PM':
                    setData['pF'] = "[오후반차]"
                    endTime = [12, 0]
                    addTime = [4, 0]
                    break
                case '2H_AM':
                    setData['pF'] = "[오전반반차]"
                    startTime = [11, 0]
                    addTime = [1, 0]
                    break
                case '2H_PM':
                    setData['pF'] = "[오후반반차]"
                    endTime = [14, 0]
                    addTime = [1, 0]
                    break
            }

            if (startTime[0] * 60 + startTime[1] > endTime[0] * 60 + endTime[1]) {
                if (workType == '4H_AM' || workType == '2H_AM') {
                    endTime[0] = startTime[0]
                    endTime[1] = startTime[1]
                }
                else {
                    startTime[0] = endTime[0]
                    startTime[1] = endTime[1]
                }
            }

            const sT = startTime[0].toString().padStart(2, '0') + ":" + startTime[1].toString().padStart(2, '0')
            const eT = endTime[0].toString().padStart(2, '0') + ":" + endTime[1].toString().padStart(2, '0')

            document.querySelector("#startTime").value = sT
            document.querySelector("#endTime").value = eT

            setData['sT'] = sT
            setData['eT'] = eT

            const remainMinutes = (endTime[1] + endTime[0] * 60) - (startTime[1] + startTime[0] * 60) + addTime[0] * 60 + addTime[1]
            setData['wT'] = Math.floor(remainMinutes / 60).toString().padStart(2, '0') + ":" + (remainMinutes % 60).toString().padStart(2, '0')
        }

        let calendarUl = document.querySelector("body > div > div.calendar > ul.days")
        let nodesWithChkBox = calendarUl.querySelectorAll("#planSet")

        for (let n of nodesWithChkBox) {
            if (n.checked == false) {
                continue
            }

            let planFlag = n.parentElement.parentElement.querySelector("#planFlag")
            let startTime = n.parentElement.parentElement.querySelector("#startTime")
            let endTime = n.parentElement.parentElement.querySelector("#endTime")
            let workTime = n.parentElement.parentElement.querySelector("#workedTime")

            if (setData.hasOwnProperty('pF')) {
                planFlag.innerText = setData['pF']
            }
            if (setData.hasOwnProperty('sT')) {
                startTime.innerText = "출근 " + setData['sT']
            }
            if (setData.hasOwnProperty('eT')) {
                endTime.innerText = "퇴근 " + setData['eT']
            }
            if (setData.hasOwnProperty('wT')) {
                workTime.innerText = "근무시간 " + setData['wT']
            }
        }

        updatePlanned()
    })

    function updatePlanned() {
        let calendarUl = document.querySelector("body > div > div.calendar > ul.days")
        let nodesWithChkBox = calendarUl.querySelectorAll("#planSet")

        // 근무 시간 계산
        let planedCnt = 0
        let planedMinutes = 0
        for (let n of nodesWithChkBox) {
            let planFlag = n.parentElement.parentElement.querySelector("#planFlag").innerText
            let workTime = n.parentElement.parentElement.querySelector("#workedTime").innerText

            if (planFlag != "[미정]") {
                planedCnt++
                let splited = workTime.split(' ')[1].split(':')
                planedMinutes += (Number(splited[0]) * 60 + Number(splited[1]))
            }
        }

        document.querySelector("#planed_work_time").innerText = Math.floor(planedMinutes / 60).toString().padStart(2, '0') + ":" + (planedMinutes % 60).toString().padStart(2, '0')
        
        let remainMinutesWithPlan = (() => {
            const remainHM = document.querySelector("#total_work_time_remained").innerText.split(':')
            const remainMinutes = Number(remainHM[0]) * 60 + Number(remainHM[1])
            return remainMinutes
        })() - planedMinutes
        
        let isOver = ""
        if (remainMinutesWithPlan < 0) {
            isOver += "-"
            remainMinutesWithPlan *= -1
        }

        const remainedCnt = Number(document.querySelector("#total_day_count_remained").innerText) - planedCnt
        document.querySelector("#total_work_time_remained_with_plan").innerText = isOver + Math.floor(remainMinutesWithPlan / 60).toString().padStart(2, '0') + ":" + (remainMinutesWithPlan % 60).toString().padStart(2, '0')
        document.querySelector("#total_day_count_remained_with_plan").innerText = remainedCnt
        document.querySelector("#avg_work_time_remained_with_plan").innerText = (() => {
            if (remainedCnt <= 0) {
                return "남은 일수 0"
            }

            const remainAvgMinutes = remainMinutesWithPlan / remainedCnt
            return isOver + Math.floor(remainAvgMinutes / 60).toString().padStart(2, '0') + ":" + (Math.floor(remainAvgMinutes % 60)).toString().padStart(2, '0')
        })()

        if (isOver == "-") {
            document.querySelector("#total_work_time_remained_with_plan").setAttribute('style', 'color:red')
            document.querySelector("#avg_work_time_remained_with_plan").setAttribute('style', 'color:red')
        }
        else {
            document.querySelector("#total_work_time_remained_with_plan").setAttribute('style', 'color:black')
            document.querySelector("#avg_work_time_remained_with_plan").setAttribute('style', 'color:black')
        }
    }
}