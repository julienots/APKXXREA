package io.appxray.runtime;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.util.Patterns;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** Login screen with local accounts (new independent implementation, no original credentials or backend). */
public class LoginActivity extends Activity {
    private AuthStore auth;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Config.applyTheme(this, "Connexion");
        auth = new AuthStore(this);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_VERTICAL);
        col.setPadding(pad, pad, pad, pad);
        TextView title = new TextView(this);
        title.setText("Connexion");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        title.setPadding(0, 0, 0, pad);
        col.addView(title);
        final EditText email = new EditText(this);
        email.setHint("Adresse e-mail");
        email.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        col.addView(email);
        final EditText password = new EditText(this);
        password.setHint("Mot de passe");
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        col.addView(password);
        Button submit = new Button(this);
        submit.setText("Se connecter");
        col.addView(submit);
        Button register = new Button(this);
        register.setText("Créer un compte");
        col.addView(register);
        setContentView(col);
        submit.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!valid(email, password)) return;
                if (auth.login(email.getText().toString().trim(), password.getText().toString())) {
                    startActivity(new Intent(LoginActivity.this, ScreenActivity.class).putExtra("afterLogin", true));
                    finish();
                } else toast("Identifiants incorrects");
            }
        });
        register.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!valid(email, password)) return;
                toast(auth.register(email.getText().toString().trim(), password.getText().toString()) ? "Compte créé, vous pouvez vous connecter" : "Ce compte existe déjà");
            }
        });
    }

    private boolean valid(EditText email, EditText password) {
        if (!Patterns.EMAIL_ADDRESS.matcher(email.getText().toString().trim()).matches()) {
            email.setError("E-mail invalide");
            return false;
        }
        if (password.getText().length() < 8) {
            password.setError("8 caractères minimum");
            return false;
        }
        return true;
    }

    private void toast(String m) {
        Toast.makeText(this, m, Toast.LENGTH_SHORT).show();
    }
}
