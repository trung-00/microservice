const { Kafka, logLevel, Partitioners } = require('kafkajs');

const TOPIC = process.env.ORDER_CREATED_TOPIC || 'order-created';

const kafka = new Kafka({
    clientId: 'order-service',
    brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
    logLevel: logLevel.WARN,
});
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });

let connected = false;

async function ensureConnected() {
    if (!connected) {
        await producer.connect();
        connected = true;
    }
}

// Gửi một lô sự kiện. Khóa = oid: các sự kiện của cùng một đơn luôn vào cùng một partition (giữ thứ tự).
// acks = -1: chỉ coi là gửi xong khi broker đã ghi nhận.
async function publishAll(events) {
    try {
        await ensureConnected();
        await producer.send({
            topic: TOPIC,
            acks: -1,
            timeout: 5000,
            messages: events.map((e) => ({
                key: String(e.aggregate_id),
                value: JSON.stringify(e.payload),
                headers: { eventType: String(e.event_type), eventId: String(e.id) },
            })),
        });
    } catch (err) {
        // Buộc kết nối lại ở lần thử sau.
        connected = false;
        await producer.disconnect().catch(() => { });
        throw err;
    }
}

async function disconnect() {
    connected = false;
    await producer.disconnect();
}

module.exports = { publishAll, disconnect };