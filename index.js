const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, Collection } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.giveaways = new Collection();

const LOG_CHANNEL_ID = '1459873973637611612';
const ALLOWED_ROLE_IDS = ['1459874963795345650', '1459875200069013597']; // rôles autorisés

client.once('ready', () => {
    console.log(`${client.user.tag} est en ligne ! `);
});

// Fonctions utilitaires
function msToTime(ms) {
    const sec = Math.floor((ms / 1000) % 60);
    const min = Math.floor((ms / (1000 * 60)) % 60);
    const h = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const d = Math.floor(ms / (1000 * 60 * 60 * 24));
    return `${d}d ${h}h ${min}m ${sec}s`;
}

async function endGiveaway(giveaway) {
    const channel = await client.channels.fetch(giveaway.channelId);
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);

    let winners = [];

    if (giveaway.winnerIds.length > 0) {
        for (const id of giveaway.winnerIds) {
            try {
                const member = await channel.guild.members.fetch(id);
                winners.push(member);
            } catch {}
        }
    }

    if (winners.length === 0 && giveaway.participants.length > 0) {
        const shuffled = [...giveaway.participants].sort(() => 0.5 - Math.random());
        winners = shuffled.slice(0, giveaway.numWinners).map(id => channel.guild.members.cache.get(id) || null).filter(Boolean);
    }

    const endEmbed = EmbedBuilder.from(giveaway.message.embeds[0])
        .setTitle('⏰ GIVEAWAY TERMINÉ')
        .setDescription(
            winners.length > 0
                ? `Gagnants : ${winners.map(w => w).join(', ')}\n**Prix :** ${giveaway.prize}`
                : `Aucun gagnant pour le prix : **${giveaway.prize}** `
        )
        .setColor(winners.length > 0 ? 'Gold' : 'Grey')
        .setTimestamp();

    giveaway.message.edit({ embeds: [endEmbed], components: [] });

    if (winners.length > 0) channel.send(`Félicitations ${winners.join(', ')}! 🎉 Vous avez gagné **${giveaway.prize}** !`);
    logChannel.send(` Giveaway terminé. Gagnants : ${winners.map(w => w.user.tag).join(', ')} | Prix : ${giveaway.prize}`);

    client.giveaways.delete(giveaway.message.id);
}

// Commande giveaway
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isCommand() && interaction.commandName === 'giveaway') {
        // Vérification des rôles
        const memberRoles = interaction.member.roles.cache.map(r => r.id);
        const hasRole = ALLOWED_ROLE_IDS.some(roleId => memberRoles.includes(roleId));

        if (!hasRole) {
            return interaction.reply({ content: ' Tu n’as pas la permission de lancer un giveaway.', ephemeral: true });
        }

        const prize = interaction.options.getString('prize');
        const durationInput = interaction.options.getString('duration');
        const winnerIdsInput = interaction.options.getString('winners') || '';
        const numWinners = interaction.options.getInteger('numwinners') || 1;
        const channel = interaction.channel;

        const timeMultiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        const match = durationInput.match(/^(\d+)([smhd])$/);
        if (!match) return interaction.reply({ content: 'Durée invalide ! Exemple : 10s, 5m, 2h, 1d', ephemeral: true });
        const duration = parseInt(match[1]) * timeMultiplier[match[2]];

        const winnerIds = winnerIdsInput.split(',').map(id => id.trim()).filter(Boolean);

        const giveawayEmbed = new EmbedBuilder()
            .setTitle('GIVEAWAY')
            .setDescription(`**Prix :** ${prize}\n**Durée :** ${durationInput}\n**Participants :** 0\nClique sur 🎁 pour participer !`)
            .setColor('Random')
            .setTimestamp()
            .setFooter({ text: `Giveaway par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('enter_giveaway')
                .setLabel('🎁 Participer')
                .setStyle(ButtonStyle.Success)
        );

        const msg = await channel.send({ embeds: [giveawayEmbed], components: [row] });

        client.giveaways.set(msg.id, {
            prize,
            participants: [],
            message: msg,
            endsAt: Date.now() + duration,
            channelId: channel.id,
            winnerIds,
            numWinners
        });

        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        logChannel.send(` Giveaway lancé par ${interaction.user.tag} | Prix : ${prize} | Durée : ${durationInput}`);

        interaction.reply({ content: `Giveaway lancé avec succès ! 🎉`, ephemeral: true });

        setTimeout(() => {
            const giveaway = client.giveaways.get(msg.id);
            if (giveaway) endGiveaway(giveaway);
        }, duration);
    }

    // Bouton participer
    if (interaction.isButton() && interaction.customId === 'enter_giveaway') {
        const giveaway = client.giveaways.get(interaction.message.id);
        if (!giveaway) return interaction.reply({ content: 'Ce giveaway est terminé ou invalide.', ephemeral: true });

        if (giveaway.participants.includes(interaction.user.id)) {
            return interaction.reply({ content: 'Tu es déjà inscrit !', ephemeral: true });
        }

        giveaway.participants.push(interaction.user.id);

        const embed = EmbedBuilder.from(giveaway.message.embeds[0])
            .setDescription(`**Prix :** ${giveaway.prize}\n**Durée :** En cours\n**Participants :** ${giveaway.participants.length}\nClique sur 🎁 pour participer !`);
        giveaway.message.edit({ embeds: [embed] });

        return interaction.reply({ content: ' Tu es maintenant inscrit au giveaway !', ephemeral: true });
    }
});

// Slash command setup
client.on(Events.ClientReady, async () => {
    const data = [
        {
            name: 'giveaway',
            description: 'Lancer un giveaway',
            options: [
                { name: 'prize', type: 3, description: 'Le prix du giveaway', required: true },
                { name: 'duration', type: 3, description: 'Durée (ex: 10s, 5m, 2h, 1d)', required: true },
                { name: 'numwinners', type: 4, description: 'Nombre de gagnants', required: false },
                { name: 'winners', type: 3, description: 'ID(s) gagnant(s) imposé(s) séparés par ,', required: false }
            ]
        }
    ];

    await client.application.commands.set(data, process.env.GUILD_ID);
});

client.login(process.env.TOKEN);
