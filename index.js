import { Telegraf, Markup } from 'telegraf';

// Variabel state dalam memori Worker
let activeBartender = { id: null, name: null };
let orderCounter = 1;
let lastResetDate = new Date().toDateString();
let activeQueue = [];
let bartenderState = {};

// Cloudflare Workers tidak mendukung setTimeout jangka panjang yang andal tanpa Durable Objects,
// tapi kita set struktur logika timeout 5 menit (300.000 ms) di sini:
let bartenderTimer = null;
const IDLE_TIMEOUT_MS = 300000; // 5 Menit

function resetBartenderTimer(botInstance, GROUP_CHAT_ID, MESSAGE_THREAD_ID) {
    if (bartenderTimer) clearTimeout(bartenderTimer);
    if (activeBartender.id === null) return;

    bartenderTimer = setTimeout(async () => {
        if (activeBartender.id !== null) {
            const idleName = activeBartender.name;
            const idleId = activeBartender.id;

            activeBartender.id = null;
            activeBartender.name = null;
            if (bartenderTimer) clearTimeout(bartenderTimer);

            try {
                await botInstance.telegram.sendMessage(
                    idleId,
                    `⚠️ **PEMBERITAHUAN SISTEM BAR** ⚠️\n\n` +
                    `Kamu telah diberhentikan otomatis sebagai bartender karena **tidak memberikan respons atau aksi selama 5 menit**. Bar kini ditutup sementara.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}

            try {
                await botInstance.telegram.sendMessage(
                    GROUP_CHAT_ID,
                    `🛑 Shift bartender **${idleName}** berakhir otomatis karena tidak ada respons selama 5 menit. Bar ditutup sementara.`,
                    { message_thread_id: MESSAGE_THREAD_ID }
                );
            } catch (e) {}
        }
    }, IDLE_TIMEOUT_MS);
}

const barMenu = [
    { 
        id: '1', title: 'Vodka', recipe: '🥃 Vodka + Ice', command: '/vodka', 
        steps: [
            'mengambil gelas pendek on-the-rocks dan menyusun es batu kristal',
            'menuangkan takaran pas vodka dingin murni ke dalam gelas',
            'memberikan sentuhan akhir dan mengelap pinggiran gelas'
        ],
        rp: 'menuangkan vodka dingin murni di atas bongkahan es kristal' 
    },
    { 
        id: '2', title: 'Gin', recipe: '🥃 Gin + Ice', command: '/gin', 
        steps: [
            'menyiapkan gelas highball dan mendinginkannya dengan es',
            'menuangkan gin botol premium pilihan dengan aroma botanikal khas',
            'mengaduknya perlahan hingga suhu gelas terasa dingin sempurna'
        ],
        rp: 'meracik gin botanikal premium yang menyegarkan di atas es batu jernih' 
    },
    { 
        id: '3', title: 'Rum', recipe: '🥃 Rum + Ice', command: '/rum', 
        steps: [
            'memilih gelas penampung khusus dan memasukkan es batu besar',
            'menuangkan rum gelap beraroma hangat karamel dan ek',
            'memutar gelas perlahan untuk meratakan suhu'
        ],
        rp: 'menuangkan rum gelap beraroma hangat dengan tambahan bongkahan es' 
    },
    { 
        id: '4', title: 'Whisky', recipe: '🥃 Whisky + Ice', command: '/whisky', 
        steps: [
            'menyiapkan gelas old-fashioned berukuran tebal',
            'memasukkan satu bola es batu besar bening ke dalam gelas',
            'menuangkan whisky klasik berkualitas tinggi perlahan-lahan'
        ],
        rp: 'menuangkan whisky klasik berkualitas di atas bola es besar' 
    },
    { 
        id: '5', title: 'Tequila', recipe: '🥃 Tequila + Lime', command: '/tequila', 
        steps: [
            'menyiapkan gelas shot atau margarita kecil',
            'menuangkan tequila murni dengan warna keemasan yang khas',
            'memotong jeruk nipis segar dan menatanya di pinggiran gelas'
        ],
        rp: 'menyiapkan tequila segar lengkap dengan irisan jeruk nipis segar' 
    },
    { 
        id: '6', title: 'Mojito', recipe: '🥃 Rum + Mint + Lime + Soda', command: '/mojito', 
        steps: [
            'memasukkan daun mint segar dan irisan jeruk nipis di dasar gelas',
            'menumbuknya perlahan (muddling) agar aromanya keluar sempurna',
            'menambahkan rum, es serut, dan menuangkan air soda di lapisan atasnya'
        ],
        rp: 'menumbuk daun mint segar, jeruk nipis, rum, dan soda dengan es melimpah' 
    },
    { 
        id: '7', title: 'Margarita', recipe: '🥃 Tequila + Lime + Triple Sec', command: '/margarita', 
        steps: [
            'mengoleskan jeruk nipis di bibir gelas lalu mencelupkannya ke mangkuk garam',
            'mencampur tequila, triple sec, dan sari lime ke dalam shaker dengan es',
            'mengocoknya kuat-kuat lalu menuangkannya tanpa es ke dalam gelas bergaram'
        ],
        rp: 'mencampur tequila, triple sec, dan lime dengan shaker lalu menyaringnya ke gelas bergaram' 
    },
    { 
        id: '8', title: 'Gin Tonic', recipe: '🥃 Gin + Tonic + Lime', command: '/gintonic', 
        steps: [
            'mengisi gelas tinggi penuh dengan es batu hingga dingin',
            'menuangkan takaran gin dan menu perlahan air tonik berkualitas',
            'memberikan irisan tipis jeruk nipis sebagai hiasan di atasnya'
        ],
        rp: 'memadukan gin, air tonik berkarbonasi, dan irisan jeruk nipis di atas segelas es' 
    },
    { 
        id: '9', title: 'Old Fashioned', recipe: '🥃 Whisky + Bitters + Sugar', command: '/oldfashioned', 
        steps: [
            'meletakkan kubus gula di gelas, lalu meneteskan aromatic bitters di atasnya',
            'menambahkan sedikit air dan menghancurkan gula hingga larut',
            'memasukkan es batu dan menuangkan whisky sambil diaduk perlahan'
        ],
        rp: 'mengaduk whisky, tetesan bitters, dan larutan gula batu secara perlahan' 
    },
    { 
        id: '10', title: 'Piña Colada', recipe: '🥃 Rum + Coconut + Pineapple', command: '/pinacolada', 
        steps: [
            'memasukkan es serut, santan kelapa kental, dan sari buah nanas segar ke mesin blender',
            'memblender rum, santan kelapa, dan sari nanas hingga bertekstur creamy menyegarkan'
        ],
        rp: 'memblender rum, santan kelapa, dan sari nanas hingga bertekstur creamy menyegarkan' 
    }
];

function checkDailyReset() {
    const currentDate = new Date().toDateString();
    if (currentDate !== lastResetDate) {
        orderCounter = 1;
        lastResetDate = currentDate;
    }
}

function formatOrderMessage(ticketDisplay, itemsText, userName, statusText, targetInfo = "") {
    const currentTime = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
    const bartenderStatus = activeBartender.name ? `👨‍🍳 Bartender: ${activeBartender.name}` : `⚠️ Bartender: BELUM ADA (Bar Tutup)`;

    return `🍸 **BAR ORDER - ANTREAN** 🍸\n` +
           `━━━━━━━━━━━━━━━━━━\n` +
           `🎫 **No. Tiket:** ${ticketDisplay}\n` +
           `👤 **Pemesan:** ${userName}${targetInfo}\n` +
           `${bartenderStatus}\n` +
           `⏰ **Waktu:** ${currentTime} WIB\n` +
           `━━━━━━━━━━━━━━━━━━\n` +
           `🍹 **Pesanan:**\n${itemsText}\n` +
           `━━━━━━━━━━━━━━━━━━\n` +
           `⚡ **Status:** ${statusText}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isValidTopic(ctx, GROUP_CHAT_ID, MESSAGE_THREAD_ID) {
    return (
        ctx.chat && 
        ctx.chat.id === GROUP_CHAT_ID && 
        ctx.message && 
        ctx.message.message_thread_id === MESSAGE_THREAD_ID
    );
}

export default {
    async fetch(request, env, ctx) {
        const BOT_TOKEN = env.BOT_TOKEN || '8826683177:AAE5vQ2zMlFS84lTpcqzwhwblC1mz1Qupv8';
        const GROUP_CHAT_ID = Number(env.GROUP_CHAT_ID || -1003895327942);
        const MESSAGE_THREAD_ID = Number(env.MESSAGE_THREAD_ID || 170270);

        const bot = new Telegraf(BOT_TOKEN);

        bot.start((ctx) => {
            ctx.reply('Halo! Bot Bar siap digunakan. Silakan pesan minuman di topic bar yang telah ditentukan.');
        });

        // ==========================================
        // 1. SYSTEM BARTENDER COMMANDS
        // ==========================================
        bot.command('jadibartender', async (ctx) => {
            const userId = ctx.from.id;
            const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');

            if (activeBartender.id !== null) {
                if (activeBartender.id === userId) {
                    return ctx.reply(`⚠️ Kamu sudah bertugas sebagai bartender saat ini!`);
                } else {
                    return ctx.reply(`❌ Maaf, posisi bartender saat ini sedang dipegang oleh **${activeBartender.name}**. Tunggu hingga ia selesai (/berhentijadi).`);
                }
            }

            activeBartender.id = userId;
            activeBartender.name = userName;

            resetBartenderTimer(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID);

            await ctx.reply(`🎉 Selamat, **${userName}** sekarang resmi bertugas sebagai **Bartender**! 🍸\n_Catatan: Batas waktu respons 5 menit per aksi._`, { parse_mode: 'Markdown' });

            try {
                let dmText = `📜 **PANDUAN BARTENDER** 📜\n\n` +
                             `Halo **${userName}**, bar kini telah **BUKA**.\n` +
                             `Ketik **/antrean** di chat ini kapan saja untuk melihat dan memproses daftar pesanan yang tertunda.\n\n` +
                             `Ketik **/berhentijadi** jika ingin mengakhiri shift.`;
                
                if (activeQueue.length > 0) {
                    dmText += `\n\n🔔 *Ada ${activeQueue.length} antrean menunggumu! Ketik /antrean untuk menampilkan tombol.*`;
                }

                await bot.telegram.sendMessage(userId, dmText, { parse_mode: 'Markdown' });

                if (activeQueue.length > 0) {
                    const nextOrder = activeQueue[0];
                    await bot.telegram.sendMessage(userId, 
                        `🔔 **ANTREAN TERDEPAN (${nextOrder.ticketDisplay})**\n\n` +
                        `🎫 Tiket: ${nextOrder.ticketDisplay}\n` +
                        `👤 Pemesan: ${nextOrder.userName}${nextOrder.targetInfo}\n` +
                        `🍹 Menu:\n${nextOrder.itemsTextFormatted}\n` +
                        `_Pilih tindakan di bawah:_`,
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback(`▶️ Mulai Racik (${nextOrder.ticketDisplay})`, `start_${nextOrder.ticketNum}`)],
                                [Markup.button.callback(`❌ Tolak Pesanan (${nextOrder.ticketDisplay})`, `reject_${nextOrder.ticketNum}`)]
                            ])
                        }
                    );
                }
            } catch (e) {
                ctx.reply(`⚠️ Gagal mengirim panduan ke chat pribadimu. Pastikan sudah klik tombol **Start** di chat pribadi bot!`);
            }
        });

        bot.command('berhentijadi', (ctx) => {
            const userId = ctx.from.id;

            if (activeBartender.id === null) {
                return ctx.reply(`ℹ️ Saat ini belum ada bartender yang bertugas.`);
            }

            if (activeBartender.id !== userId) {
                return ctx.reply(`❌ Kamu bukan bartender aktif saat ini (**${activeBartender.name}**).`);
            }

            if (bartenderTimer) clearTimeout(bartenderTimer);
            const prevName = activeBartender.name;
            activeBartender.id = null;
            activeBartender.name = null;

            ctx.reply(`🛑 **${prevName}** telah selesai bertugas. Sisa antrean (${activeQueue.length} pesanan) diamankan di sistem.`, { parse_mode: 'Markdown' });
        });

        bot.command('antrean', async (ctx) => {
            if (activeBartender.id !== ctx.from.id) {
                return ctx.reply(`❌ Perintah ini hanya bisa digunakan oleh bartender yang sedang bertugas.`);
            }

            resetBartenderTimer(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID);

            if (activeQueue.length === 0) {
                return ctx.reply(`✨ Aman! Tidak ada antrean pesanan yang tertunda saat ini.`);
            }

            let listText = `📋 **DAFTAR ANTREAN TERTUNDA (${activeQueue.length} pesanan):**\n\n`;
            activeQueue.forEach((q, idx) => {
                const statusPrefix = idx === 0 ? "👉 **[SEKARANG]** " : "";
                listText += `${idx + 1}.${statusPrefix}Tiket **${q.ticketDisplay}** - Pemesan: *${q.userName}*\n`;
            });
            listText += `\n_Berikut adalah panel kontrol untuk antrean terdepan:_`;

            const nextOrder = activeQueue[0];
            await ctx.reply(listText, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback(`▶️ Mulai Racik (${nextOrder.ticketDisplay})`, `start_${nextOrder.ticketNum}`)],
                    [Markup.button.callback(`❌ Tolak Pesanan (${nextOrder.ticketDisplay})`, `reject_${nextOrder.ticketNum}`)]
                ])
            });
        });

        // ==========================================
        // 2. FUNGSI PEMESANAN & ANTREAN
        // ==========================================
        async function processOrder(itemsList, userName, userUsername, targetInfo = "", ctxForReply = null) {
            checkDailyReset();

            let itemsTextFormatted = "";
            itemsList.forEach(i => {
                itemsTextFormatted += `▪️ ${i.qty}x ${i.title} (${i.recipe})\n`;
            });

            let ticketDisplay = "";
            let initialStatus = "";
            let sentMsg;

            if (activeBartender.id === null) {
                ticketDisplay = "TUTUP (Tanpa Tiket)";
                initialStatus = "Bar Tutup (Belum ada bartender)";

                const messageContent = formatOrderMessage(ticketDisplay, itemsTextFormatted, userName, initialStatus, targetInfo);

                sentMsg = await bot.telegram.sendMessage(GROUP_CHAT_ID, messageContent, {
                    parse_mode: 'Markdown',
                    message_thread_id: MESSAGE_THREAD_ID
                });

                if (ctxForReply) {
                    ctxForReply.reply(`⚠️ Bar sedang tutup. Pesanan dicatat tapi tiket tidak dihitung.`, {
                        message_thread_id: MESSAGE_THREAD_ID
                    });
                }
                return;
            }

            ticketDisplay = `#${String(orderCounter).padStart(3, '0')}`;
            const currentTicketNum = String(orderCounter).padStart(3, '0');
            orderCounter++;

            initialStatus = "Menunggu diracik...";
            const messageContent = formatOrderMessage(ticketDisplay, itemsTextFormatted, userName, initialStatus, targetInfo);

            sentMsg = await bot.telegram.sendMessage(GROUP_CHAT_ID, messageContent, {
                parse_mode: 'Markdown',
                message_thread_id: MESSAGE_THREAD_ID
            });

            const orderObj = {
                ticketNum: currentTicketNum,
                ticketDisplay,
                items: itemsList,
                userName,
                userUsername,
                targetInfo,
                groupMsgId: sentMsg.message_id,
                itemsTextFormatted,
                orderDate: new Date().toDateString()
            };

            const isFirstInQueue = activeQueue.length === 0;
            activeQueue.push(orderObj);

            if (isFirstInQueue) {
                resetBartenderTimer(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID);

                try {
                    await bot.telegram.sendMessage(activeBartender.id, 
                        `🔔 **ANTREAN BAR BARU! (${ticketDisplay})**\n\n` +
                        `🎫 Tiket: ${ticketDisplay}\n` +
                        `👤 Pemesan: ${userName}${targetInfo}\n` +
                        `🍹 Menu:\n${itemsTextFormatted}\n` +
                        `_Pilih tindakan di bawah (Batas waktu respons 5 menit):_`,
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback(`▶️ Mulai Racik (${ticketDisplay})`, `start_${currentTicketNum}`)],
                                [Markup.button.callback(`❌ Tolak Pesanan (${ticketDisplay})`, `reject_${currentTicketNum}`)]
                            ])
                        }
                    );
                } catch (e) {
                    console.log("Gagal mengirim DM ke bartender aktif:", e.message);
                }
            }
        }

        // ==========================================
        // 3. COMMAND HANDLERS & MENU BUTTONS
        // ==========================================
        barMenu.forEach(item => {
            const cmdName = item.command.replace('/', '');
            bot.command(cmdName, async (ctx) => {
                if (!isValidTopic(ctx, GROUP_CHAT_ID, MESSAGE_THREAD_ID)) {
                    return ctx.reply(`⚠️ Pesanan hanya dapat dilakukan di room topic bar yang sah!`);
                }

                const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
                const userUsername = ctx.from.username ? `@${ctx.from.username}` : userName;
                const args = ctx.message.text.split(' ');
                let qty = 1;
                if (args[1] && !isNaN(args[1])) {
                    qty = parseInt(args[1]);
                    if (qty < 1) qty = 1;
                    if (qty > 10) qty = 10;
                }

                const itemsList = [{ title: item.title, recipe: item.recipe, steps: item.steps, rp: item.rp, qty: qty }];
                await processOrder(itemsList, userName, userUsername, "", ctx);
            });
        });

        bot.command('traktir', async (ctx) => {
            if (!isValidTopic(ctx, GROUP_CHAT_ID, MESSAGE_THREAD_ID)) {
                return ctx.reply(`⚠️ Perintah traktir hanya dapat dilakukan di room topic bar!`);
            }

            const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
            const userUsername = ctx.from.username ? `@${ctx.from.username}` : userName;
            const text = ctx.message.text.replace('/traktir', '').trim();
            
            if (!text) {
                return ctx.reply(`⚠️ Format salah!\nContoh: \`/traktir mojito @Teman1 @Teman2\``, { parse_mode: 'Markdown' });
            }

            let foundItem = null;
            let targetDrinkName = "";

            for (const m of barMenu) {
                if (text.toLowerCase().includes(m.title.toLowerCase())) {
                    foundItem = m;
                    targetDrinkName = m.title;
                    break;
                }
            }

            if (!foundItem) {
                return ctx.reply(`❌ Minuman tidak ditemukan dalam menu. Ketik /menu untuk melihat daftar minuman.`);
            }

            let remainder = text.replace(new RegExp(targetDrinkName, 'i'), '').trim();
            let targets = remainder.match(/@[^\s]+/g) || [];
            if (targets.length === 0 && remainder.length > 0) {
                targets = [remainder];
            }

            if (targets.length === 0) {
                return ctx.reply(`⚠️ Sebutkan minimal satu orang yang ingin ditraktir!\nContoh: \`/traktir vodka @TemanKamu\``, { parse_mode: 'Markdown' });
            }

            let totalQty = 1 + targets.length;
            let targetInfo = `🎁 *(Traktir untuk ${targets.join(', ')} — Total${totalQty} Gelas)*`;

            const itemsList = [{ title: foundItem.title, recipe: foundItem.recipe, steps: foundItem.steps, rp: foundItem.rp, qty: totalQty }];
            await processOrder(itemsList, userName, userUsername, targetInfo, ctx);
        });

        bot.command('pesan', async (ctx) => {
            if (!isValidTopic(ctx, GROUP_CHAT_ID, MESSAGE_THREAD_ID)) {
                return ctx.reply(`⚠️ Perintah pesan hanya dapat dilakukan di room topic bar!`);
            }

            const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
            const userUsername = ctx.from.username ? `@${ctx.from.username}` : userName;
            const text = ctx.message.text.replace('/pesan', '').trim();

            if (!text) return ctx.reply(`⚠️ Format salah!\nContoh: \`/pesan vodka, mojito, whisky\``, { parse_mode: 'Markdown' });

            const requestedNames = text.split(',').map(s => s.trim().toLowerCase());
            const itemsList = [];

            requestedNames.forEach(req => {
                const matched = barMenu.find(m => m.title.toLowerCase() === req);
                if (matched) {
                    const existing = itemsList.find(i => i.title === matched.title);
                    if (existing) existing.qty += 1;
                    else itemsList.push({ title: matched.title, recipe: matched.recipe, steps: matched.steps, rp: matched.rp, qty: 1 });
                }
            });

            if (itemsList.length === 0) return ctx.reply(`❌ Tidak ada minuman valid yang ditemukan. Cek /menu.`);

            await processOrder(itemsList, userName, userUsername, "", ctx);
        });

        bot.command('menu', (ctx) => {
            if (!isValidTopic(ctx, GROUP_CHAT_ID, MESSAGE_THREAD_ID)) {
                return ctx.reply(`⚠️ Menu bar hanya dapat diakses di room topic bar!`);
            }

            let menuText = "🍸 **BAR MENU (#beach & pool)** 🍸\n\n━━━━━━━━━━━━━━━━━━\n\n";
            let keyboardButtons = [];
            let row = [];

            barMenu.forEach((item, index) => {
                menuText += `${index + 1}. 🍸 **${item.title}** - _${item.recipe}_\n`;
                row.push(Markup.button.callback(`🍹 ${item.title}`, `order_btn_${item.id}`));
                if (row.length === 2) {
                    keyboardButtons.push(row);
                    row = [];
                }
            });

            if (row.length > 0) {
                keyboardButtons.push(row);
            }

            menuText += `━━━━━━━━━━━━━━━━━━\n` +
                        `💡 **Cara Pesan Cepat:**\n` +
                        `• Klik tombol menu di bawah untuk pesan instan!\n` +
                        `• Ketik manual: \`/vodka 3\`\n` +
                        `• Traktir teman: \`/traktir vodka @Teman1 @Teman2\`\n\n` +
                        `👨‍🍳 **Status Bartender:** ${activeBartender.name ? activeBartender.name : 'Belum ada (Ketik /jadibartender)'}`;
            
            ctx.reply(menuText, {
                parse_mode: 'Markdown',
                message_thread_id: MESSAGE_THREAD_ID,
                ...Markup.inlineKeyboard(keyboardButtons)
            });
        });

        barMenu.forEach(item => {
            bot.action(`order_btn_${item.id}`, async (ctx) => {
                const userName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
                const userUsername = ctx.from.username ? `@${ctx.from.username}` : userName;

                try {
                    await ctx.answerCbQuery(`Berhasil memesan ${item.title}!`);
                } catch (e) {}

                const itemsList = [{ title: item.title, recipe: item.recipe, steps: item.steps, rp: item.rp, qty: 1 }];
                await processOrder(itemsList, userName, userUsername, "", null);
            });
        });

        // ==========================================
        // 4. INTERAKSI KONTROL BARTENDER & VALIDASI ANTREAN
        // ==========================================
        bot.action(/start_(.+)/, async (ctx) => {
            resetBartenderTimer(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID);

            const ticketNum = ctx.match[1];

            if (activeQueue.length === 0) {
                return ctx.answerCbQuery('Antrean kosong!', { show_alert: true });
            }

            const nextInLine = activeQueue[0];
            if (nextInLine.ticketNum !== ticketNum) {
                return ctx.answerCbQuery(`❌ GAGAL! Kamu harus menyelesaikan antrean terkecil terlebih dahulu yaitu Tiket #${nextInLine.ticketNum}!`, { show_alert: true });
            }

            try { await ctx.answerCbQuery('Memulai peracikan antrean...'); } catch (e) {}

            const order = nextInLine;

            try {
                let totalItemsCount = order.items.reduce((acc, curr) => acc + curr.qty, 0);
                let currentItemIndex = 1;

                for (const item of order.items) {
                    for (let q = 1; q <= item.qty; q++) {
                        let step1 = `🛠️ [Gelas ${currentItemIndex}/${totalItemsCount}] ${item.steps[0]}...`;
                        await bot.telegram.editMessageText(GROUP_CHAT_ID, order.groupMsgId, undefined, formatOrderMessage(order.ticketDisplay, order.itemsTextFormatted, order.userName, step1, order.targetInfo), { parse_mode: 'Markdown' });
                        await ctx.editMessageText(`🛠️ Meracik (${order.ticketDisplay}) - **${item.title}**:\n_1. ${item.steps[0]}_`, { parse_mode: 'Markdown' });
                        await sleep(3000);

                        let step2 = `🧊 [Gelas ${currentItemIndex}/${totalItemsCount}] ${item.steps[1]}...`;
                        await bot.telegram.editMessageText(GROUP_CHAT_ID, order.groupMsgId, undefined, formatOrderMessage(order.ticketDisplay, order.itemsTextFormatted, order.userName, step2, order.targetInfo), { parse_mode: 'Markdown' });
                        await ctx.editMessageText(`🧊 Meracik (${order.ticketDisplay}) - **${item.title}**:\n_2. ${item.steps[1]}_`, { parse_mode: 'Markdown' });
                        await sleep(3000);

                        if (item.steps[2]) {
                            let step3 = `✨ [Gelas ${currentItemIndex}/${totalItemsCount}] ${item.steps[2]}...`;
                            await bot.telegram.editMessageText(GROUP_CHAT_ID, order.groupMsgId, undefined, formatOrderMessage(order.ticketDisplay, order.itemsTextFormatted, order.userName, step3, order.targetInfo), { parse_mode: 'Markdown' });
                            await ctx.editMessageText(`✨ Meracik (${order.ticketDisplay}) - **${item.title}**:\n_3. ${item.steps[2]}_`, { parse_mode: 'Markdown' });
                            await sleep(2500);
                        }

                        currentItemIndex++;
                    }
                }

                await bot.telegram.editMessageText(
                    GROUP_CHAT_ID, order.groupMsgId, undefined,
                    formatOrderMessage(order.ticketDisplay, order.itemsTextFormatted, order.userName, "✅ **SELESAI & DISAJIKAN**", order.targetInfo),
                    { parse_mode: 'Markdown' }
                );

                await ctx.editMessageText(
                    `✅ Peracikan fisik ${order.ticketDisplay} selesai dan status di grup sudah diperbarui!\n\n_Pilih opsi di bawah untuk mengirim pesan penutup ke pemesan:_`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback(`💬 Berikan Catatan Khusus`, `note_custom_${order.ticketNum}`)],
                            [Markup.button.callback(`🚀 Selesai Tanpa Catatan`, `note_skip_${order.ticketNum}`)]
                        ])
                    }
                );

            } catch (err) {
                console.log("Error proses antrean:", err);
                await ctx.editMessageText(`❌ Terjadi kesalahan saat memproses antrean.`);
            }
        });

        bot.action(/note_custom_(.+)/, async (ctx) => {
            resetBartenderTimer(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID);
            try { await ctx.answerCbQuery(); } catch (e) {}
            const ticketNum = ctx.match[1];
            const orderIndex = activeQueue.findIndex(o => o.ticketNum === ticketNum);
            if (orderIndex === -1) return ctx.editMessageText(`❌ Data antrean sudah tidak valid.`);

            const order = activeQueue[orderIndex];
            bartenderState[ctx.from.id] = { action: 'finish_note', order };

            await ctx.editMessageText(`✍️ Silakan ketik catatan/pesan penutup untuk pemesan di chat ini:`, { parse_mode: 'Markdown' });
        });

        bot.action(/note_skip_(.+)/, async (ctx) => {
            resetBartenderTimer(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID);
            try { await ctx.answerCbQuery('Menyelesaikan pesanan...'); } catch (e) {}
            const ticketNum = ctx.match[1];
            const orderIndex = activeQueue.findIndex(o => o.ticketNum === ticketNum);
            if (orderIndex === -1) return ctx.editMessageText(`❌ Data antrean sudah tidak valid.`);

            const order = activeQueue[orderIndex];
            await finalizeOrder(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID, order, "Silakan dinikmati hidangannya!");
        });

        bot.action(/reject_(.+)/, async (ctx) => {
            resetBartenderTimer(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID);
            const ticketNum = ctx.match[1];

            if (activeQueue.length === 0) {
                return ctx.answerCbQuery('Antrean kosong!', { show_alert: true });
            }

            const nextInLine = activeQueue[0];
            if (nextInLine.ticketNum !== ticketNum) {
                return ctx.answerCbQuery(`❌ GAGAL! Kamu harus memproses atau menolak antrean terkecil terlebih dahulu yaitu Tiket #${nextInLine.ticketNum}!`, { show_alert: true });
            }

            try { await ctx.answerCbQuery('Mempersiapkan penolakan...'); } catch (e) {}
            const order = nextInLine;

            bartenderState[ctx.from.id] = { action: 'reject_reason', order };
            await ctx.editMessageText(`❌ Silakan ketik **alasan penolakan pesanan ${order.ticketDisplay}** di chat ini:`, { parse_mode: 'Markdown' });
        });

        bot.on('text', async (ctx) => {
            const userId = ctx.from.id;
            if (!bartenderState[userId]) return;

            resetBartenderTimer(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID);

            const state = bartenderState[userId];
            const textInput = ctx.message.text.trim();
            delete bartenderState[userId];

            if (state.action === 'finish_note') {
                const order = state.order;
                const note = !textInput ? "Silakan dinikmati hidangannya!" : textInput;
                await finalizeOrder(bot, GROUP_CHAT_ID, MESSAGE_THREAD_ID, order, note);
                await ctx.reply(`✅ Pesanan ${order.ticketDisplay} berhasil diselesaikan! 🍹`);
            } else if (state.action === 'reject_reason') {
                const order = state.order;
                const reason = textInput;
                const tagUser = order.userUsername;

                const rejectMessage = `❌ PESANAN DITOLAK - #beach & pool ❌\n\n` +
                                      `Maaf ${tagUser}, pesananmu (${order.ticketDisplay}) terpaksa ditolak oleh bartender.\n\n` +
                                      `💬 Alasan / Catatan: "${reason}"`;

                await bot.telegram.sendMessage(GROUP_CHAT_ID, rejectMessage, {
                    message_thread_id: MESSAGE_THREAD_ID
                });

                activeQueue.shift();
                sendNextQueuePrompt(bot, userId);

                await ctx.reply(`🚫 Pesanan ${order.ticketDisplay} telah dibatalkan.`);
            }
        });

        async function finalizeOrder(botInstance, chatId, threadId, order, note) {
            let combinedRp = order.items.map(i => `${i.qty}x ${i.rp}`).join(', serta ');
            const tagUser = order.userUsername;

            const finalMessage = `🍸 BAR SERVICE - #beach & pool 🍸\n\n` +
                                 `Halo ${tagUser}! Bartender **${activeBartender.name}** menyelesaikan pesananmu dengan ${combinedRp}. ${order.targetInfo}\n\n` +
                                 `🍹 Pesanan (${order.ticketDisplay}):\n${order.itemsTextFormatted}\n` +
                                 `💬 Catatan Bartender: "${note}"\n\n` +
                                 `_“Semoga waktu bersantaimu di tepi kolam semakin menyenangkan!”_ ✨`;

            await botInstance.telegram.sendMessage(chatId, finalMessage, {
                message_thread_id: threadId
            });

            activeQueue.shift();
            sendNextQueuePrompt(botInstance, activeBartender.id);
        }

        async function sendNextQueuePrompt(botInstance, userId) {
            if (activeQueue.length > 0) {
                const nextOrder = activeQueue[0];
                try {
                    await botInstance.telegram.sendMessage(userId, 
                        `🔔 **LANJUT ANTREAN BERIKUTNYA! (${nextOrder.ticketDisplay})**\n\n` +
                        `🎫 Tiket: ${nextOrder.ticketDisplay}\n` +
                        `👤 Pemesan: ${nextOrder.userName}${nextOrder.targetInfo}\n` +
                        `🍹 Menu:\n${nextOrder.itemsTextFormatted}\n` +
                        `_Pilih tindakan di bawah:_`,
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback(`▶️ Mulai Racik (${nextOrder.ticketDisplay})`, `start_${nextOrder.ticketNum}`)],
                                [Markup.button.callback(`❌ Tolak Pesanan (${nextOrder.ticketDisplay})`, `reject_${nextOrder.ticketNum}`)]
                            ])
                        }
                    );
                } catch (e) {}
            }
        }

        return await bot.handleUpdate(await request.json());
    }
};
