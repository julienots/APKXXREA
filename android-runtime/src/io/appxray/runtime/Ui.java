package io.appxray.runtime;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.RelativeLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** Builds native Android views from an APPXRAY UI tree (same model as the UI Reconstructor). */
final class Ui {
    private final Activity a;
    private final float density;
    private final Map<String, Integer> ids = new HashMap<String, Integer>();

    Ui(Activity a) {
        this.a = a;
        this.density = a.getResources().getDisplayMetrics().density;
    }

    View build(JSONObject root) {
        collectIds(root);
        View v = create(root, null);
        v.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return v;
    }

    private void collectIds(JSONObject n) {
        String id = n.optString("viewId", "");
        if (id.length() > 0 && !ids.containsKey(id)) ids.put(id, View.generateViewId());
        JSONArray kids = n.optJSONArray("children");
        if (kids != null) for (int i = 0; i < kids.length(); i++) collectIds(kids.optJSONObject(i));
    }

    private int dp(double v) {
        return (int) Math.round(v * density);
    }

    private View create(JSONObject n, String parentKind) {
        String kind = n.optString("kind", "view");
        JSONObject p = n.optJSONObject("props");
        if (p == null) p = new JSONObject();
        View v;
        boolean container = false;
        if ("linear".equals(kind) || "toolbar".equals(kind)) {
            LinearLayout l = new LinearLayout(a);
            l.setOrientation("toolbar".equals(kind) || "horizontal".equals(p.optString("orientation")) ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);
            if ("toolbar".equals(kind) && !p.has("background")) l.setBackgroundColor(Config.themeColor(a, "primary", 0xFF2F6BFF));
            v = l;
            container = true;
        } else if ("relative".equals(kind) || "constraint".equals(kind)) {
            v = new RelativeLayout(a);
            container = true;
        } else if ("scroll".equals(kind)) {
            v = new ScrollView(a);
            container = true;
        } else if ("hscroll".equals(kind)) {
            v = new HorizontalScrollView(a);
            container = true;
        } else if ("frame".equals(kind) || "card".equals(kind) || "fragment".equals(kind) || "include".equals(kind) || "surface".equals(kind) || "custom".equals(kind)) {
            FrameLayout f = new FrameLayout(a);
            if ("card".equals(kind)) {
                GradientDrawable g = new GradientDrawable();
                g.setColor(0xFFFFFFFF);
                g.setCornerRadius(dp(10));
                f.setBackground(g);
                f.setElevation(dp(2));
            }
            v = f;
            container = true;
        } else if ("text".equals(kind)) v = new TextView(a);
        else if ("button".equals(kind)) v = new Button(a);
        else if ("edit".equals(kind)) v = new EditText(a);
        else if ("check".equals(kind)) v = new CheckBox(a);
        else if ("switch".equals(kind)) v = new Switch(a);
        else if ("radio".equals(kind)) v = new RadioButton(a);
        else if ("imagebutton".equals(kind)) v = new ImageButton(a);
        else if ("image".equals(kind)) v = new ImageView(a);
        else if ("progress".equals(kind)) v = "match".equals(p.optString("width")) ? new ProgressBar(a, null, android.R.attr.progressBarStyleHorizontal) : new ProgressBar(a);
        else if ("seek".equals(kind)) v = new SeekBar(a);
        else if ("list".equals(kind)) v = new ListView(a);
        else if ("web".equals(kind)) v = new WebView(a);
        else if ("spinner".equals(kind)) v = new Spinner(a);
        else v = new View(a);

        String vid = n.optString("viewId", "");
        if (ids.containsKey(vid)) v.setId(ids.get(vid));
        applyCommon(v, p);
        if (v instanceof TextView) applyText((TextView) v, p);
        if (v instanceof ImageView) {
            Drawable d = paint(p.optJSONObject("src"));
            if (d != null) ((ImageView) v).setImageDrawable(d);
            ((ImageView) v).setScaleType(scale(p.optString("scaleType", "fitCenter")));
        }
        if (v instanceof LinearLayout || v instanceof FrameLayout || v instanceof RelativeLayout) {
            int g = gravity(p.optString("gravity", ""));
            if (g != 0) {
                if (v instanceof LinearLayout) ((LinearLayout) v).setGravity(g);
                else if (v instanceof RelativeLayout) ((RelativeLayout) v).setGravity(g);
            }
        }
        if (container) {
            JSONArray kids = n.optJSONArray("children");
            ViewGroup target = (ViewGroup) v;
            if ((v instanceof ScrollView || v instanceof HorizontalScrollView) && kids != null && kids.length() > 1) {
                LinearLayout wrap = new LinearLayout(a);
                wrap.setOrientation(v instanceof ScrollView ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
                target.addView(wrap, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
                target = wrap;
                kind = "linear";
            }
            if (kids != null) for (int i = 0; i < kids.length(); i++) {
                JSONObject c = kids.optJSONObject(i);
                JSONObject cp = c.optJSONObject("props");
                if (cp != null && "gone".equals(cp.optString("visibility")) && c.optJSONArray("children") == null) continue;
                View child = create(c, kind);
                target.addView(child, params(target, cp == null ? new JSONObject() : cp, kind));
            }
        }
        final JSONObject click = p.optJSONObject("onClick");
        if (click != null) v.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                action(click.optString("type"), click.optString("value"));
            }
        });
        return v;
    }

    private void applyCommon(View v, JSONObject p) {
        JSONArray pad = p.optJSONArray("padding");
        if (pad != null && pad.length() == 4) v.setPadding(dp(pad.optDouble(0)), dp(pad.optDouble(1)), dp(pad.optDouble(2)), dp(pad.optDouble(3)));
        Drawable bg = paint(p.optJSONObject("background"));
        if (bg != null) v.setBackground(bg);
        String vis = p.optString("visibility", "visible");
        if ("gone".equals(vis)) v.setVisibility(View.GONE);
        else if ("invisible".equals(vis)) v.setVisibility(View.INVISIBLE);
    }

    private void applyText(TextView t, JSONObject p) {
        if (p.has("text")) t.setText(p.optString("text"));
        if (p.has("hint")) t.setHint(p.optString("hint"));
        if (p.has("textColor")) t.setTextColor(Config.color(p.optString("textColor"), 0xFF000000));
        if (p.has("textSize")) t.setTextSize(TypedValue.COMPLEX_UNIT_SP, (float) p.optDouble("textSize", 14));
        String st = p.optString("textStyle", "");
        if (st.contains("bold") || st.contains("italic")) t.setTypeface(t.getTypeface(), (st.contains("bold") ? Typeface.BOLD : 0) | (st.contains("italic") ? Typeface.ITALIC : 0));
        int g = gravity(p.optString("gravity", ""));
        if (g != 0) t.setGravity(g);
        if (t instanceof android.widget.CompoundButton && p.optBoolean("checked", false)) ((android.widget.CompoundButton) t).setChecked(true);
        if (t instanceof EditText) {
            String it = p.optString("inputType", "");
            int type = InputType.TYPE_CLASS_TEXT;
            if (it.contains("Password")) type |= InputType.TYPE_TEXT_VARIATION_PASSWORD;
            else if (it.contains("Email")) type |= InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS;
            else if (it.contains("MultiLine")) type |= InputType.TYPE_TEXT_FLAG_MULTI_LINE;
            if (it.startsWith("number")) type = InputType.TYPE_CLASS_NUMBER;
            if (it.startsWith("phone")) type = InputType.TYPE_CLASS_PHONE;
            t.setInputType(type);
        }
    }

    private ViewGroup.LayoutParams params(ViewGroup parent, JSONObject p, String parentKind) {
        int w = size(p.optString("width", "wrap"), "constraint".equals(parentKind));
        int h = size(p.optString("height", "wrap"), "constraint".equals(parentKind));
        ViewGroup.MarginLayoutParams lp;
        if (parent instanceof LinearLayout) {
            LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(w, h, (float) p.optDouble("weight", 0));
            l.gravity = gravity(p.optString("layoutGravity", ""));
            lp = l;
        } else if (parent instanceof RelativeLayout) {
            RelativeLayout.LayoutParams r = new RelativeLayout.LayoutParams(w, h);
            rules(r, p.optJSONObject("rules"), "constraint".equals(parentKind), w, h);
            lp = r;
        } else if (parent instanceof FrameLayout) {
            FrameLayout.LayoutParams f = new FrameLayout.LayoutParams(w, h);
            int g = gravity(p.optString("layoutGravity", ""));
            if (g != 0) f.gravity = g;
            lp = f;
        } else lp = new ViewGroup.MarginLayoutParams(w, h);
        JSONArray m = p.optJSONArray("margin");
        if (m != null && m.length() == 4) lp.setMargins(dp(m.optDouble(0)), dp(m.optDouble(1)), dp(m.optDouble(2)), dp(m.optDouble(3)));
        return lp;
    }

    private int size(String s, boolean constraintChild) {
        if ("match".equals(s)) return ViewGroup.LayoutParams.MATCH_PARENT;
        if ("wrap".equals(s) || s.length() == 0) return ViewGroup.LayoutParams.WRAP_CONTENT;
        try {
            double v = Double.parseDouble(s.replace("dp", ""));
            if (v == 0 && constraintChild) return ViewGroup.LayoutParams.MATCH_PARENT;
            return dp(v);
        } catch (Exception e) {
            return ViewGroup.LayoutParams.WRAP_CONTENT;
        }
    }

    private int ref(String id) {
        Integer i = ids.get(id);
        return i == null ? -1 : i;
    }

    /** RelativeLayout rules; ConstraintLayout constraints are approximated with the equivalent RelativeLayout rules. */
    private void rules(RelativeLayout.LayoutParams r, JSONObject rules, boolean constraint, int w, int h) {
        if (rules == null) return;
        boolean ps = false, pe = false, pt = false, pb = false;
        Iterator<String> it = rules.keys();
        while (it.hasNext()) {
            String k = it.next();
            String v = rules.optString(k);
            if (!constraint) {
                int rule = relRule(k.replace("layout_", ""));
                if (rule < 0) continue;
                if ("true".equals(v)) r.addRule(rule);
                else if (ref(v) > 0) r.addRule(rule, ref(v));
                continue;
            }
            if (!k.startsWith("layout_constraint")) continue;
            String[] parts = k.replace("layout_constraint", "").replace("Of", "").split("_to");
            if (parts.length != 2) continue;
            String f = side(parts[0]), t = side(parts[1]);
            boolean parent = "parent".equals(v);
            int id = ref(v);
            if (!parent && id < 0) continue;
            if (parent) {
                if (f.equals("Top") && t.equals("Top")) pt = true;
                if (f.equals("Bottom") && t.equals("Bottom")) pb = true;
                if (f.equals("Start") && t.equals("Start")) ps = true;
                if (f.equals("End") && t.equals("End")) pe = true;
            } else {
                if (f.equals("Top") && t.equals("Bottom")) r.addRule(RelativeLayout.BELOW, id);
                if (f.equals("Top") && t.equals("Top")) r.addRule(RelativeLayout.ALIGN_TOP, id);
                if (f.equals("Bottom") && t.equals("Top")) r.addRule(RelativeLayout.ABOVE, id);
                if (f.equals("Bottom") && t.equals("Bottom")) r.addRule(RelativeLayout.ALIGN_BOTTOM, id);
                if (f.equals("Start") && t.equals("End")) r.addRule(RelativeLayout.END_OF, id);
                if (f.equals("Start") && t.equals("Start")) r.addRule(RelativeLayout.ALIGN_START, id);
                if (f.equals("End") && t.equals("Start")) r.addRule(RelativeLayout.START_OF, id);
                if (f.equals("End") && t.equals("End")) r.addRule(RelativeLayout.ALIGN_END, id);
            }
        }
        if (ps && pe && w != ViewGroup.LayoutParams.MATCH_PARENT) r.addRule(RelativeLayout.CENTER_HORIZONTAL);
        else {
            if (ps) r.addRule(RelativeLayout.ALIGN_PARENT_START);
            if (pe) r.addRule(RelativeLayout.ALIGN_PARENT_END);
        }
        if (pt && pb && h != ViewGroup.LayoutParams.MATCH_PARENT) r.addRule(RelativeLayout.CENTER_VERTICAL);
        else {
            if (pt) r.addRule(RelativeLayout.ALIGN_PARENT_TOP);
            if (pb) r.addRule(RelativeLayout.ALIGN_PARENT_BOTTOM);
        }
    }

    private static String side(String s) {
        return "Left".equals(s) ? "Start" : "Right".equals(s) ? "End" : s;
    }

    private static int relRule(String k) {
        if ("below".equals(k)) return RelativeLayout.BELOW;
        if ("above".equals(k)) return RelativeLayout.ABOVE;
        if ("toRightOf".equals(k)) return RelativeLayout.RIGHT_OF;
        if ("toLeftOf".equals(k)) return RelativeLayout.LEFT_OF;
        if ("toEndOf".equals(k)) return RelativeLayout.END_OF;
        if ("toStartOf".equals(k)) return RelativeLayout.START_OF;
        if ("alignParentTop".equals(k)) return RelativeLayout.ALIGN_PARENT_TOP;
        if ("alignParentBottom".equals(k)) return RelativeLayout.ALIGN_PARENT_BOTTOM;
        if ("alignParentLeft".equals(k)) return RelativeLayout.ALIGN_PARENT_LEFT;
        if ("alignParentRight".equals(k)) return RelativeLayout.ALIGN_PARENT_RIGHT;
        if ("alignParentStart".equals(k)) return RelativeLayout.ALIGN_PARENT_START;
        if ("alignParentEnd".equals(k)) return RelativeLayout.ALIGN_PARENT_END;
        if ("centerInParent".equals(k)) return RelativeLayout.CENTER_IN_PARENT;
        if ("centerHorizontal".equals(k)) return RelativeLayout.CENTER_HORIZONTAL;
        if ("centerVertical".equals(k)) return RelativeLayout.CENTER_VERTICAL;
        if ("alignTop".equals(k)) return RelativeLayout.ALIGN_TOP;
        if ("alignBottom".equals(k)) return RelativeLayout.ALIGN_BOTTOM;
        if ("alignLeft".equals(k)) return RelativeLayout.ALIGN_LEFT;
        if ("alignRight".equals(k)) return RelativeLayout.ALIGN_RIGHT;
        if ("alignStart".equals(k)) return RelativeLayout.ALIGN_START;
        if ("alignEnd".equals(k)) return RelativeLayout.ALIGN_END;
        if ("alignBaseline".equals(k)) return RelativeLayout.ALIGN_BASELINE;
        return -1;
    }

    static int gravity(String g) {
        if (g == null || g.length() == 0) return 0;
        int out = 0;
        for (String s : g.split("\\|")) {
            if ("center".equals(s)) out |= Gravity.CENTER;
            else if ("center_horizontal".equals(s)) out |= Gravity.CENTER_HORIZONTAL;
            else if ("center_vertical".equals(s)) out |= Gravity.CENTER_VERTICAL;
            else if ("start".equals(s)) out |= Gravity.START;
            else if ("end".equals(s)) out |= Gravity.END;
            else if ("left".equals(s)) out |= Gravity.LEFT;
            else if ("right".equals(s)) out |= Gravity.RIGHT;
            else if ("top".equals(s)) out |= Gravity.TOP;
            else if ("bottom".equals(s)) out |= Gravity.BOTTOM;
            else if ("fill".equals(s)) out |= Gravity.FILL;
        }
        return out;
    }

    private static ImageView.ScaleType scale(String s) {
        if ("centerCrop".equals(s)) return ImageView.ScaleType.CENTER_CROP;
        if ("center".equals(s)) return ImageView.ScaleType.CENTER;
        if ("centerInside".equals(s)) return ImageView.ScaleType.CENTER_INSIDE;
        if ("fitXY".equals(s)) return ImageView.ScaleType.FIT_XY;
        if ("fitStart".equals(s)) return ImageView.ScaleType.FIT_START;
        if ("fitEnd".equals(s)) return ImageView.ScaleType.FIT_END;
        return ImageView.ScaleType.FIT_CENTER;
    }

    /** Background / src paint: bitmap asset (with its source density), shape colour, radius and stroke. */
    private Drawable paint(JSONObject p) {
        if (p == null) return null;
        String asset = p.optString("asset", "");
        if (asset.length() > 0) {
            try {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inDensity = p.optInt("density", 160);
                o.inTargetDensity = a.getResources().getDisplayMetrics().densityDpi;
                InputStream in = a.getAssets().open("appxray/img/" + asset);
                Bitmap b = BitmapFactory.decodeStream(in, null, o);
                in.close();
                if (b != null) return new BitmapDrawable(a.getResources(), b);
            } catch (Exception ignored) {
            }
        }
        if (p.has("color") || p.has("radius") || p.has("stroke")) {
            GradientDrawable g = new GradientDrawable();
            g.setColor(Config.color(p.optString("color", null), 0x00000000));
            if (p.has("radius")) g.setCornerRadius(dp(p.optDouble("radius")));
            if (p.has("stroke")) g.setStroke(dp(1), Config.color(p.optString("stroke"), 0xFF000000));
            return g;
        }
        return null;
    }

    void action(String type, String value) {
        try {
            if ("navigate".equals(type)) {
                Class<?> feature = Features.activityFor(value);
                Intent i = feature != null ? new Intent(a, feature) : new Intent(a, ScreenActivity.class).putExtra("screen", value);
                a.startActivity(i);
            } else if ("url".equals(type)) a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(value)));
            else if ("toast".equals(type)) Toast.makeText(a, value, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(a, "Action impossible : " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }
}
