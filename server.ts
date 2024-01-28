import { ClientConfig, Client, middleware, MiddlewareConfig, WebhookEvent, TextMessage, MessageAPIResponseBase } from '@line/bot-sdk';
import express, { Application, Request, Response } from 'express';

import axios, { AxiosResponse } from 'axios';
import * as xml2js from 'xml2js';


require('dotenv').config();

// LINEクライアントとExpressの設定を行う
const clientConfig: ClientConfig = {
	channelAccessToken: process.env.LINE_ACCESS || '',
	channelSecret: process.env.LINE_SECRET || '',
};

const middlewareConfig: MiddlewareConfig = {
	channelAccessToken: process.env.LINE_ACCESS || '',
	channelSecret: process.env.LINE_SECRET || '',
};

const PORT = process.env.PORT || 3000;

// LINE SDKクライアントを新規に作成
const client = new Client(clientConfig);

// Expressアプリケーションを新規に作成
const app: Application = express();

function formatDate(dateString: string): string {
	const year = parseInt(dateString.substr(0, 4), 10);
	const month = parseInt(dateString.substr(4, 2), 10);
	const day = parseInt(dateString.substr(6, 2), 10);
	const hours = parseInt(dateString.substr(8, 2), 10);
	const minutes = parseInt(dateString.substr(10, 2), 10);

	return `${month}月${day}日 ${hours}時${minutes}分`;
}

// テキストを受け取る関数
const textEventHandler = async (event: WebhookEvent): Promise<MessageAPIResponseBase | undefined> => {
	// すべての変数を処理
	if (event.type !== 'message' || event.message.type !== 'text') {
		return;
	}
	const { replyToken } = event;
	const { text } = event.message;

	// 新規メッセージの作成
	try {
		const weather = await weatherReport(text);
		const formattedDate = formatDate(weather.forecast.Date[0]);
		let umbrella;

		if (parseInt(weather.forecast.Rainfall[0]) == 0.0) {
			umbrella = "傘は必要ありません";
		} else if (parseInt(weather.forecast.Rainfall[0]) >= 1) {
			umbrella = "MUST: 傘を持って行くべきです"
		} else if (parseInt(weather.forecast.Rainfall[0]) < 1) {
			umbrella = "OPTIONAL: 傘はあった方がいいです";
		}

		const message = (`検索地域: ${weather.Place}\n${formattedDate}の予報\n降水強度は${weather.forecast.Rainfall[0]}%です。\n\n${umbrella}`)
	
		const response: TextMessage = {
			type: 'text', 
			text: message
		};
	
		// ユーザーに返信
		await client.replyMessage(replyToken, response);
	} catch (error) {
		const response: TextMessage = {
			type: 'text', 
			text: "error"
		};
		await client.replyMessage(replyToken, response);
	}
};

// Webhookに使用されるルート
app.post('/webhook', middleware(middlewareConfig), async (req: Request, res: Response): Promise<Response> => {
	const events: WebhookEvent[] = req.body.events;

		// 受信したすべてのイベントを非同期で処理
		const results = await Promise.all(
			events.map(async (event: WebhookEvent) => {
				try {
					console.log("--text handle--");
					await textEventHandler(event);
				} catch (err: unknown) {
					if (err instanceof Error) {
						console.error(err);
					}

					// エラーメッセージを返す
					return res.status(500).json({
						status: 'エラー',
					});
				}
			})
		);

		// 成功した場合のメッセージを返す
		return res.status(200).json({
			status: '成功',
			results,
		});
	}
);

interface RegionInfo {
	map: string;
	lat: string;
	lng: string;
}

async function getPlace(region: string): Promise<RegionInfo> {
	try {
		const apiUrl = `https://www.geocoding.jp/api/?q=${region}`
		const respons: AxiosResponse = await axios.get(apiUrl);
		// console.log("res is: ",respons.data);
		return new Promise((resolve, reject) => {
			xml2js.parseString(respons.data, (err, result) => {
				if (err) {
					console.error(err);
					return;
				}
				
				const map = result.result.google_maps;
				const regionInfo = result.result.coordinate[0];
				// console.log("INFO is: ", regionInfo)
				if (regionInfo) {
					const lat: string = regionInfo.lat[0]
					const lng: string = regionInfo.lat[0];
				
					// console.log('緯度:', lat);
					// console.log('経度:', lng);
					resolve ({map, lat, lng})
				} else {
					console.error('API response does not contain expected data structure.');
				}
			});
		});
	} catch (error) {
		throw error
	}
}

async function weatherReport(region: string): Promise<{ Place: string, forecast: any }> {
	console.log('Running myFunction...');
	const YAHOO_ID = process.env.YAHOO_CLIENT || "";
	const PLACE = await getPlace(region);
	// console.log("Place is: ", PLACE);

	const apiUrl = `https://map.yahooapis.jp/weather/V1/place?coordinates=${PLACE.lat + PLACE.lng}&appid=${YAHOO_ID}`
	try {
		const response: AxiosResponse = await axios.get(apiUrl);

		if (response.status === 200) {
			const xmlString = response.data;

			return new Promise((resolve, reject) => {
				xml2js.parseString(xmlString, (err, result) => {
					if (err) {
						console.error(err);
						return;
					}
					const weatherInfo = result.YDF.Feature[0].Property[0].WeatherList[0].Weather;
	
					// 特定の情報を抽出
					const forecast = weatherInfo.filter((weather: any) => weather.Type[0] === 'forecast');

					console.log({ Place: PLACE.map, forecast: forecast[5] });
					resolve ({ Place: PLACE.map, forecast: forecast[5] });
				});
			});

		} else {
			console.error(`API request failed with status: ${response.status}`);
			return { Place: '', forecast: null };
		}
	} catch(error) {

	}
	return { Place: '', forecast: null };
}

// const intervalId = setInterval(() => weatherReport("六本木"), 4000);

// setTimeout(() => {
// 	clearInterval(intervalId);
// 	console.log('Interval cleared. Stopping...');
// }, 30000);


app.listen(PORT, () => {
	console.log(`http://localhost:${PORT}/`);
});