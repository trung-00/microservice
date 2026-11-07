const MAX_BACKOFF_MS = 15000;

// Vòng lặp nền đẩy sự kiện từ bảng Outbox lên Kafka (UC09 bước 6).
// outboxRepository và eventBus được truyền từ ngoài vào (index.js).
function createOutboxPublisher({ outboxRepository, eventBus, intervalMs = 1000, batchSize = 20, logger = console }) {
    let stopped = true;
    let timer = null;
    let wakeUp = null;
    let loopPromise = Promise.resolve();

    const sleep = (ms) =>
        new Promise((resolve) => {
            wakeUp = resolve;
            timer = setTimeout(resolve, ms);
        });

    async function publishOnce() {
        return outboxRepository.processPending(batchSize, (events) => eventBus.publishAll(events));
    }

    // Gửi liên tục cho đến khi hết sự kiện chờ, để không bị chậm khi có nhiều đơn cùng lúc.
    async function drain() {
        let n;
        do {
            n = await publishOnce();
            if (n > 0) logger.log(`[order] published ${n} event(s) to Kafka`);
        } while (n === batchSize && !stopped);
    }

    async function loop() {
        let failures = 0;
        while (!stopped) {
            try {
                await drain();
                failures = 0;
            } catch (e) {
                failures += 1;
                logger.error(`[order] outbox publish failed (events stay PENDING, will retry): ${e.message}`);
            }
            if (stopped) break;
            // Kafka lỗi thì giãn dần khoảng cách thử lại, tối đa 15 giây.
            await sleep(Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS));
        }
    }

    function start() {
        if (!stopped) return;
        stopped = false;
        loopPromise = loop();
    }

    async function stop() {
        stopped = true;
        clearTimeout(timer);
        if (wakeUp) wakeUp();
        await loopPromise;
    }

    return { start, stop, publishOnce };
}

module.exports = { createOutboxPublisher };