const { Kafka, logLevel, Partitioners } = require('kafkajs');

const TOPIC = process.env.ORDER_CREATED_TOPIC || 'order-created';
const DLQ_TOPIC = process.env.ORDER_CREATED_DLQ_TOPIC || 'order-created-dlq';

const kafka = new Kafka({
    clientId: 'shipment-service',
    brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
    logLevel: logLevel.WARN,
});
const consumer = kafka.consumer({ groupId: 'shipment-service' });
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });

let running = false;
let producerReady = false;

consumer.on(consumer.events.GROUP_JOIN, () => {
    running = true;
    console.log('[shipment] Kafka consumer joined the group');
});
for (const name of ['CRASH', 'STOP', 'DISCONNECT']) {
    consumer.on(consumer.events[name], () => {
        running = false;
        console.error(`[shipment] Kafka consumer event: ${name}`);
    });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Kafka có thể chưa sẵn sàng ngay lúc service khởi động: thử lại thay vì thoát.
async function withRetry(label, fn, attempts = 30, delayMs = 2000) {
    for (let i = 1; ; i += 1) {
        try {
            return await fn();
        } catch (e) {
            if (i >= attempts) throw e;
            console.error(`[shipment] ${label} failed (attempt ${i}/${attempts}): ${e.message}`);
            await sleep(delayMs);
        }
    }
}

// Hàng đợi thư chết: sự kiện không hợp lệ được giữ lại cùng lý do, không bị mất.
const deadLetter = {
    async send(rawText, reason, meta = {}) {
        if (!producerReady) {
            await producer.connect();
            producerReady = true;
        }
        await producer.send({
            topic: DLQ_TOPIC,
            messages: [
                {
                    key: meta.key || null,
                    value: rawText,
                    headers: {
                        error: String(reason),
                        sourceTopic: String(meta.topic),
                        sourcePartition: String(meta.partition),
                        sourceOffset: String(meta.offset),
                    },
                },
            ],
        });
    },
};

// handle(text, meta) ném lỗi (ví dụ DB sập) thì Kafka KHÔNG đánh dấu đã xử lý và sẽ giao lại.
async function start(handle) {
    await withRetry('connect consumer', async () => {
        await consumer.connect();
        await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    });
    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            const text = message.value ? message.value.toString() : '';
            const key = message.key ? message.key.toString() : null;
            await handle(text, { topic, partition, offset: message.offset, key });
        },
    });
}

async function stop() {
    await consumer.disconnect().catch(() => { });
    await producer.disconnect().catch(() => { });
}

module.exports = { start, stop, deadLetter, isRunning: () => running };