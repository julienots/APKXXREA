package com.superessence.musicmetric.audio;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.net.Uri;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Decoding of any Android-supported audio file and encoding to M4A (AAC) or WAV. */
public final class Codec {
    private Codec() { }
    public static final int MAX_SECONDS = 15 * 60;

    static final class FloatList {
        float[] a = new float[1 << 16]; int n;
        void add(float v) { if (n == a.length) { float[] b = new float[a.length * 2]; System.arraycopy(a, 0, b, 0, n); a = b; } a[n++] = v; }
        float[] toArray() { float[] b = new float[n]; System.arraycopy(a, 0, b, 0, n); return b; }
    }

    public static AudioData decode(Context ctx, Uri uri, Progress p) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        ex.setDataSource(ctx, uri, null);
        int track = -1; MediaFormat fmt = null;
        for (int i = 0; i < ex.getTrackCount(); i++) {
            MediaFormat f = ex.getTrackFormat(i); String mime = f.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) { track = i; fmt = f; break; }
        }
        if (track < 0) { ex.release(); throw new IOException("Aucune piste audio dans ce fichier"); }
        ex.selectTrack(track);
        String mime = fmt.getString(MediaFormat.KEY_MIME);
        int sr = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE), ch = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        long durUs = fmt.containsKey(MediaFormat.KEY_DURATION) ? fmt.getLong(MediaFormat.KEY_DURATION) : 0;
        MediaCodec codec = MediaCodec.createDecoderByType(mime);
        codec.configure(fmt, null, null, 0);
        codec.start();
        FloatList L = new FloatList(), R = new FloatList();
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean inEos = false, outEos = false; boolean isFloat = false;
        long maxFrames = (long) MAX_SECONDS * sr;
        try {
            while (!outEos) {
                if (!inEos) {
                    int ii = codec.dequeueInputBuffer(5000);
                    if (ii >= 0) {
                        ByteBuffer ib = codec.getInputBuffer(ii);
                        int size = ex.readSampleData(ib, 0);
                        if (size < 0) { codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inEos = true; }
                        else { codec.queueInputBuffer(ii, 0, size, ex.getSampleTime(), 0); ex.advance(); }
                    }
                }
                int oi = codec.dequeueOutputBuffer(info, 5000);
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = codec.getOutputFormat();
                    if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) sr = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    if (of.containsKey("pcm-encoding")) isFloat = of.getInteger("pcm-encoding") == 4;
                } else if (oi >= 0) {
                    ByteBuffer ob = codec.getOutputBuffer(oi);
                    if (ob != null && info.size > 0) {
                        ob.position(info.offset); ob.limit(info.offset + info.size); ob.order(ByteOrder.LITTLE_ENDIAN);
                        if (isFloat) {
                            int frames = info.size / 4 / ch;
                            for (int f = 0; f < frames; f++) {
                                float l = ob.getFloat(), r = ch > 1 ? ob.getFloat() : l;
                                for (int c = 2; c < ch; c++) ob.getFloat();
                                L.add(l); R.add(r);
                            }
                        } else {
                            int frames = info.size / 2 / ch;
                            for (int f = 0; f < frames; f++) {
                                float l = ob.getShort() / 32768f, r = ch > 1 ? ob.getShort() / 32768f : l;
                                for (int c = 2; c < ch; c++) ob.getShort();
                                L.add(l); R.add(r);
                            }
                        }
                    }
                    codec.releaseOutputBuffer(oi, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEos = true;
                    if (durUs > 0) p.set(Math.min(0.95f, info.presentationTimeUs / (float) durUs), null);
                    if (L.n >= maxFrames) outEos = true;
                }
            }
        } finally {
            try { codec.stop(); } catch (Exception ignored) { }
            codec.release(); ex.release();
        }
        if (L.n == 0) throw new IOException("Impossible de décoder ce fichier audio");
        float[] l = L.toArray(), r = R.toArray();
        if (sr != AudioData.SR) { double ratio = sr / (double) AudioData.SR; l = Dsp.resample(l, ratio); r = Dsp.resample(r, ratio); }
        p.set(1, null);
        return new AudioData(l, r);
    }

    // ---------------------------------------------------------------- WAV

    public static void writeWav(AudioData a, OutputStream os) throws IOException {
        OutputStream out = new BufferedOutputStream(os, 1 << 16);
        int n = a.length(), dataLen = n * 4;
        ByteBuffer h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        h.put("RIFF".getBytes()).putInt(36 + dataLen).put("WAVE".getBytes()).put("fmt ".getBytes())
                .putInt(16).putShort((short) 1).putShort((short) 2).putInt(AudioData.SR).putInt(AudioData.SR * 4)
                .putShort((short) 4).putShort((short) 16).put("data".getBytes()).putInt(dataLen);
        out.write(h.array());
        byte[] buf = new byte[4096 * 4]; int bi = 0;
        for (int i = 0; i < n; i++) {
            short l = toShort(a.l[i]), r = toShort(a.r[i]);
            buf[bi++] = (byte) l; buf[bi++] = (byte) (l >> 8); buf[bi++] = (byte) r; buf[bi++] = (byte) (r >> 8);
            if (bi == buf.length) { out.write(buf); bi = 0; }
        }
        out.write(buf, 0, bi); out.flush();
    }

    static short toShort(float v) {
        int s = Math.round(v * 32767f); if (s > 32767) s = 32767; if (s < -32768) s = -32768; return (short) s;
    }

    // ---------------------------------------------------------------- AAC / M4A

    public static void writeM4a(AudioData a, File dst, int bitrate, Progress p) throws IOException {
        MediaFormat f = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, AudioData.SR, 2);
        f.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        f.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
        f.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384);
        MediaCodec enc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
        enc.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        enc.start();
        MediaMuxer mux = new MediaMuxer(dst.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        int muxTrack = -1; boolean muxStarted = false;
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        int n = a.length(), pos = 0; boolean inEos = false, outEos = false;
        try {
            while (!outEos) {
                if (!inEos) {
                    int ii = enc.dequeueInputBuffer(5000);
                    if (ii >= 0) {
                        ByteBuffer ib = enc.getInputBuffer(ii); ib.clear(); ib.order(ByteOrder.LITTLE_ENDIAN);
                        int frames = Math.min(ib.capacity() / 4, Math.min(1024, n - pos));
                        if (frames <= 0) {
                            enc.queueInputBuffer(ii, 0, 0, pts(pos), MediaCodec.BUFFER_FLAG_END_OF_STREAM); inEos = true;
                        } else {
                            for (int i = 0; i < frames; i++) { ib.putShort(toShort(a.l[pos + i])); ib.putShort(toShort(a.r[pos + i])); }
                            enc.queueInputBuffer(ii, 0, frames * 4, pts(pos), 0);
                            pos += frames;
                            if ((pos & 0x3FFFF) < 1024) p.set(pos / (float) n, null);
                        }
                    }
                }
                int oi = enc.dequeueOutputBuffer(info, 5000);
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    muxTrack = mux.addTrack(enc.getOutputFormat()); mux.start(); muxStarted = true;
                } else if (oi >= 0) {
                    ByteBuffer ob = enc.getOutputBuffer(oi);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0;
                    if (info.size > 0 && muxStarted && ob != null) {
                        ob.position(info.offset); ob.limit(info.offset + info.size);
                        mux.writeSampleData(muxTrack, ob, info);
                    }
                    enc.releaseOutputBuffer(oi, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEos = true;
                }
            }
        } finally {
            try { enc.stop(); } catch (Exception ignored) { }
            enc.release();
            try { if (muxStarted) mux.stop(); } catch (Exception ignored) { }
            mux.release();
        }
    }

    static long pts(int frame) { return frame * 1000000L / AudioData.SR; }
}
