const express = require("express")
const {scraper, scraperLocal} = require("./src/crawler/scrapeProduct")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())

// https://www.amazon.in/s?k=lighter eg

app.post("/scrape", async (req, res)=>{
    const body = req.body;
    console.log(body)
    console.log("workign")
    try {
        const response = await scraper(body.product);
        res.json({message:response})
    } catch (error) {
        console.log(error)
        res.json({error:error})
    }
})

app.post("/noproxy/scrape", async (req, res)=>{
    const body = req.body;
    console.log(body)
    console.log("workign")
    try {
        const response = await scraperLocal(body.product);
        res.json({message:response})
    } catch (error) {
        console.log(error)
        res.json({error:error})
    }
})

app.get("/testing", (req, res)=>{
    console.log("working testing")
    res.json({message:"index.js server running at 3000"})
})

app.listen(3000,()=>{
    console.log("Scraper server starting")
})