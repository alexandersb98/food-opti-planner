from argon2 import PasswordHasher

from server import hash_password


def answer(monkeypatch, *typed):
    answers = iter(typed)
    monkeypatch.setattr(hash_password, "getpass", lambda prompt: next(answers))


def test_prints_a_hash_of_the_typed_password(monkeypatch, capsys):
    answer(monkeypatch, "secret", "secret")
    assert hash_password.main() == 0
    assert PasswordHasher().verify(capsys.readouterr().out.strip(), "secret")


def test_refuses_when_the_two_passwords_differ(monkeypatch, capsys):
    answer(monkeypatch, "secret", "secrte")
    assert hash_password.main() == 1
    assert capsys.readouterr().out == ""


def test_refuses_an_empty_password(monkeypatch, capsys):
    answer(monkeypatch, "", "")
    assert hash_password.main() == 1
    assert capsys.readouterr().out == ""
